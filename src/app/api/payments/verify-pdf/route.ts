import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTaskCaller } from '@/lib/services/staff-tasks/task-caller';
import { recordOwnerUpload } from '@/lib/services/owner-todo/owner-todo-service';
import {
  parseStatementItems,
  type PdfTextItem,
} from '@/lib/services/payments/gcash-statement-parser';
import { matchStatementPayments } from '@/lib/services/payments/gcash-statement-matcher';
import { fetchPaymentsForStatement } from '@/lib/services/payments/payment-log-queries';
import type { VerifyPdfResponse } from '@/types/payment-log.types';

// Use Node.js runtime so we can use pdfjs-dist
export const runtime = 'nodejs';

// Vercel serverless polyfills for browser-only globals that pdf.js expects
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix { constructor() {} } as unknown as typeof DOMMatrix;
}
if (typeof globalThis.Path2D === 'undefined') {
  globalThis.Path2D = class Path2D { constructor() {} } as unknown as typeof Path2D;
}

export async function POST(request: Request) {
  try {
    // Verifying payments is the owners' job (the Payments page is owners only).
    const caller = await getTaskCaller();
    if (!caller?.isManagement) {
      return NextResponse.json({ error: 'Only the owners can verify payments.' }, { status: 403 });
    }
    const formData = await request.formData();
    const file = formData.get('file') as Blob | null;
    const password = formData.get('password') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();

    // Force Vercel's Node File Trace (NFT) to bundle the worker file
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- NFT traces require() calls; import may not be picked up the same way
    require('pdfjs-dist/legacy/build/pdf.worker.js');

    // Use the native pdfjs-dist library which properly supports password decryption
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.js';

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      password: password || undefined,
    });

    const pdfDocument = await loadingTask.promise;

    const pagesItems: PdfTextItem[][] = [];
    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      const items = (textContent.items as unknown[]).filter(
        (it): it is PdfTextItem =>
          typeof it === 'object' &&
          it !== null &&
          'str' in it &&
          'transform' in it &&
          Array.isArray((it as PdfTextItem).transform),
      );
      pagesItems.push(items);
    }

    const { transactions, dateRange } = parseStatementItems(pagesItems);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const allPayments = await fetchPaymentsForStatement(supabase);
    const { verifiedIds, amountMismatches, suggestedMatches } = matchStatementPayments({
      transactions,
      allPayments,
    });

    // Batch update in chunks to avoid serverless timeouts
    for (let i = 0; i < verifiedIds.length; i += 100) {
      const chunk = verifiedIds.slice(i, i + 100);
      const { error: updateError } = await supabase
        .from('payments')
        .update({ status: 'Verified' })
        .in('id', chunk);

      if (updateError) {
        console.error('Error batch updating verified payments:', updateError);
        throw updateError;
      }
    }

    const verifiedCount = verifiedIds.length;

    // Owner to-do: remember when the statement was last uploaded.
    await recordOwnerUpload(supabase, {
      kind: 'gcash_statement',
      byName: caller.name,
      matched: verifiedCount,
      fileName: (file as File).name || null,
    }).catch((e) => console.error('Could not save the GCash upload time:', e));

    const response: VerifyPdfResponse = {
      success: true,
      verifiedCount,
      amountMismatches,
      suggestedMatches,
      statementRowCount: transactions.length,
      statementDateRange: dateRange,
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error('PDF verification error:', error);
    const errObj = error as { name?: string; message?: string };
    if (errObj?.name === 'PasswordException') {
      return NextResponse.json({ error: 'Incorrect or missing password for PDF.' }, { status: 401 });
    }
    return NextResponse.json(
      { error: errObj?.message || 'Failed to parse PDF or verify payments.' },
      { status: 500 },
    );
  }
}
