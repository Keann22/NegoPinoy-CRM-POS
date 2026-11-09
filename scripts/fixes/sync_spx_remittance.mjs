import fs from 'fs';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
const supabase = createClient(
  envConfig.NEXT_PUBLIC_SUPABASE_URL,
  envConfig.SUPABASE_SERVICE_ROLE_KEY || envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const filePath = 'C:/Users/Keneth/Downloads/account_transaction_list_b65918debda5470d8b1e0ab77546cdd5.xlsx';

async function main() {
  console.log('1. Reading Excel file:', filePath);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];

  let headersFound = false;
  let trackingCol = -1;
  let typeCol = -1;
  let amountCol = -1;

  const trackingData = new Map();

  ws.eachRow((row) => {
    if (!headersFound) {
      row.eachCell((cell, colNumber) => {
        const val = cell.value?.toString().toLowerCase().trim() || '';
        if (val === 'tracking number') trackingCol = colNumber;
        else if (val === 'transaction type') typeCol = colNumber;
        else if (val.includes('transaction amount')) amountCol = colNumber;
      });
      if (trackingCol !== -1 && typeCol !== -1 && amountCol !== -1) headersFound = true;
      return;
    }

    const rawTracking = row.getCell(trackingCol).value?.toString().trim();
    if (!rawTracking || rawTracking === '-' || rawTracking.toLowerCase() === 'n/a') return;

    const key = rawTracking.toUpperCase();
    const type = row.getCell(typeCol).value?.toString().toLowerCase().trim() || '';
    const amount = parseFloat(row.getCell(amountCol).value?.toString().replace(/,/g, '') || '0');

    if (!trackingData.has(key)) {
      trackingData.set(key, { originalTrackingNo: rawTracking, cod: 0, shippingFee: 0, processingFee: 0 });
    }
    const item = trackingData.get(key);
    if (type === 'cod') {
      item.cod += amount;
    } else if (type.includes('shipping fee refund')) {
      item.shippingFee += amount;
    } else if (type.includes('shipping fee')) {
      item.shippingFee += amount;
    } else if (type.includes('cod service fee refund')) {
      item.processingFee += amount;
    } else if (amount < 0) {
      item.processingFee += amount;
    }
  });

  console.log(`   Found ${trackingData.size} unique valid tracking numbers in Excel.`);

  console.log('2. Fetching all orders with tracking numbers from database (paginated)...');
  const allOrders = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, tracking_number, balance_due, amount_paid, status, total_amount, payment_method, installment_months, monthly_payment, payments(id, payment_method, amount)')
      .not('tracking_number', 'is', null)
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    allOrders.push(...data);
    if (data.length < pageSize) break;
    page++;
  }
  console.log(`   Fetched ${allOrders.length} orders from database.`);

  console.log('3. Fetching recorded SPX fee expenses (paginated)...');
  const feeAlreadyRecordedFor = new Set();
  let expPage = 0;
  while (true) {
    const { data, error } = await supabase
      .from('expenses')
      .select('description')
      .ilike('description', 'SPX%Fee for Order #%')
      .range(expPage * pageSize, (expPage + 1) * pageSize - 1);
    if (error) throw error;
    data.forEach((e) => {
      const match = e.description?.match(/Order #(\w+)/);
      if (match) feeAlreadyRecordedFor.add(match[1]);
    });
    if (data.length < pageSize) break;
    expPage++;
  }
  console.log(`   Found ${feeAlreadyRecordedFor.size} existing recorded SPX fee expenses.`);

  console.log('4. Matching orders with Excel tracking numbers...');
  const processedTracking = new Set();
  const workList = [];

  for (const order of allOrders) {
    if (!order.tracking_number) continue;

    const trackingList = order.tracking_number
      .split(/[\s,\/]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);

    let totalCod = 0;
    let totalAvailableCod = 0;
    let totalShippingFee = 0;
    let totalProcessingFee = 0;
    const matchedTrackingNos = [];
    let matched = false;

    for (const t of trackingList) {
      if (trackingData.has(t)) {
        const item = trackingData.get(t);

        let balanceNeeded = 0;
        if (order.payment_method === 'Installment' || order.payment_method === 'Lay-away') {
          const expectedDownpayment = (order.total_amount || 0) - ((order.installment_months || 0) * (order.monthly_payment || 0));
          balanceNeeded = Math.max(0, expectedDownpayment - (order.amount_paid || 0));
        } else {
          balanceNeeded = Math.max(0, (order.balance_due || 0) - totalCod);
        }

        const availableCod = item.cod;
        totalAvailableCod += availableCod;

        const codToApply = balanceNeeded > 0 ? Math.min(balanceNeeded, availableCod) : 0;
        const shippingFeeToApply = item.shippingFee;
        const processingFeeToApply = item.processingFee;

        totalCod += codToApply;
        totalShippingFee += shippingFeeToApply;
        totalProcessingFee += processingFeeToApply;

        item.cod -= codToApply;
        item.shippingFee = 0;
        item.processingFee = 0;

        matchedTrackingNos.push(item.originalTrackingNo || t);
        processedTracking.add(t);
        matched = true;
      }
    }

    if (matched) {
      const joinedTracking = matchedTrackingNos.join(', ');
      const shortOrderId = order.id.substring(0, 7).toUpperCase();
      const hasSpxPayment = order.payments?.some((p) => p.payment_method === 'SPX COD Remittance');
      const alreadyCoveredElsewhere = totalAvailableCod > 0 && totalCod === 0;
      const isAlreadySettled = Boolean(hasSpxPayment || order.status === 'Payment Received (COD)' || alreadyCoveredElsewhere);

      let settledMessage = 'Order COD has already been synced or is fully paid.';
      if (alreadyCoveredElsewhere) {
        settledMessage = 'Down payment/balance already recorded via another payment — SPX collection was not added again to avoid double counting.';
      }

      workList.push({
        order,
        joinedTracking,
        shortOrderId,
        totalCod,
        totalAvailableCod,
        totalShippingFee,
        totalProcessingFee,
        isAlreadySettled,
        settledMessage
      });
    }
  }

  console.log(`   Matched ${workList.length} total orders.`);
  const alreadySettledCount = workList.filter(w => w.isAlreadySettled).length;
  const toUpdateCount = workList.filter(w => !w.isAlreadySettled && (w.totalCod > 0 || w.totalShippingFee !== 0 || w.totalProcessingFee !== 0)).length;
  console.log(`   - Already settled (will verify expenses): ${alreadySettledCount}`);
  console.log(`   - Ready to update payments & balances: ${toUpdateCount}`);

  console.log('\n5. Executing database updates with concurrency...');
  let completed = 0;
  let successUpdates = 0;
  let feeInserts = 0;
  let errors = 0;

  const concurrency = 10;
  let workIdx = 0;

  async function worker() {
    while (workIdx < workList.length) {
      const idx = workIdx++;
      const work = workList[idx];
      const { order, shortOrderId, totalCod, totalShippingFee, totalProcessingFee } = work;

      try {
        if (work.isAlreadySettled) {
          const explicitShippingFee = Math.abs(totalShippingFee);
          const explicitProcessingFee = Math.abs(totalProcessingFee);

          if ((explicitShippingFee > 0 || explicitProcessingFee > 0) && !feeAlreadyRecordedFor.has(shortOrderId)) {
            if (explicitShippingFee > 0) {
              await supabase.from('expenses').insert({
                amount: explicitShippingFee,
                category: 'Shipping Fee',
                expense_date: new Date().toISOString(),
                description: `SPX Shipping Fee for Order #${shortOrderId}`
              });
              feeInserts++;
            }
            if (explicitProcessingFee > 0) {
              await supabase.from('expenses').insert({
                amount: explicitProcessingFee,
                category: 'Processing Fee',
                expense_date: new Date().toISOString(),
                description: `SPX Courier Fee for Order #${shortOrderId}`
              });
              feeInserts++;
            }
            feeAlreadyRecordedFor.add(shortOrderId);
          }
        } else if (totalCod > 0 || totalShippingFee !== 0 || totalProcessingFee !== 0) {
          if (totalCod > 0) {
            const newAmountPaid = (order.amount_paid || 0) + totalCod;
            const newBalanceDue = Math.max(0, (order.balance_due || 0) - totalCod);
            const nextStatus = newBalanceDue <= 0 ? (order.status === 'Completed' ? 'Completed' : 'Payment Received (COD)') : order.status;

            const { error: orderError } = await supabase
              .from('orders')
              .update({
                amount_paid: newAmountPaid,
                balance_due: newBalanceDue,
                status: nextStatus
              })
              .eq('id', order.id);

            if (orderError) throw orderError;

            const { error: paymentError } = await supabase
              .from('payments')
              .insert({
                order_id: order.id,
                amount: totalCod,
                payment_date: new Date().toISOString(),
                payment_method: 'SPX COD Remittance',
                notes: 'Auto-synced from SPX Remittance file',
                status: 'Verified'
              });

            if (paymentError) throw paymentError;
            successUpdates++;
          }

          const finalShippingFee = Math.abs(totalShippingFee);
          let finalProcessingFee = Math.abs(totalProcessingFee);
          const excelHadNoDeductions = totalShippingFee === 0 && totalProcessingFee === 0;

          if (excelHadNoDeductions && totalCod > 0) {
            let expectedCollectionAmount = 0;
            if (order.payment_method === 'Installment' || order.payment_method === 'Lay-away') {
              const expectedDownpayment = (order.total_amount || 0) - ((order.installment_months || 0) * (order.monthly_payment || 0));
              expectedCollectionAmount = Math.max(0, expectedDownpayment - (order.amount_paid || 0));
            } else {
              expectedCollectionAmount = order.balance_due || 0;
            }

            if (expectedCollectionAmount > 0 && totalCod < expectedCollectionAmount) {
              finalProcessingFee = expectedCollectionAmount - totalCod;
            }
          }

          if (!feeAlreadyRecordedFor.has(shortOrderId)) {
            if (finalShippingFee > 0) {
              await supabase.from('expenses').insert({
                amount: finalShippingFee,
                category: 'Shipping Fee',
                expense_date: new Date().toISOString(),
                description: `SPX Shipping Fee for Order #${shortOrderId}`
              });
              feeInserts++;
            }

            if (finalProcessingFee > 0) {
              await supabase.from('expenses').insert({
                amount: finalProcessingFee,
                category: 'Processing Fee',
                expense_date: new Date().toISOString(),
                description: `SPX Courier Fee for Order #${shortOrderId}`
              });
              feeInserts++;
            }

            if (finalShippingFee > 0 || finalProcessingFee > 0) {
              feeAlreadyRecordedFor.add(shortOrderId);
            }
          }
        }
      } catch (err) {
        errors++;
        console.error(`Error processing order ${shortOrderId}:`, err.message);
      }

      completed++;
      if (completed % 200 === 0 || completed === workList.length) {
        process.stdout.write(`   Progress: ${completed} / ${workList.length} orders (${Math.round((completed / workList.length) * 100)}%)...\n`);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  console.log('\n=== SYNC COMPLETE ===');
  console.log(`- Successfully updated orders with COD payments: ${successUpdates}`);
  console.log(`- Already settled orders preserved: ${alreadySettledCount}`);
  console.log(`- Courier fee expenses logged: ${feeInserts}`);
  console.log(`- Errors encountered: ${errors}`);

  const notFoundCount = Array.from(trackingData.keys()).filter(t => !processedTracking.has(t)).length;
  console.log(`- Unmatched historical/external tracking numbers: ${notFoundCount}`);
}

main().catch(console.error);
