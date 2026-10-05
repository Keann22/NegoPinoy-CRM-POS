'use client';

import { FileText, Sparkles, Tag } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CRM_EMAIL_TEMPLATES } from '@/hooks/useCrmEmail';

interface EmailComposerProps {
  subject: string;
  setSubject: (sub: string) => void;
  body: string;
  setBody: (body: string) => void;
  selectedTemplateId: string;
  applyTemplate: (id: string) => void;
}

export function EmailComposer({
  subject,
  setSubject,
  body,
  setBody,
  selectedTemplateId,
  applyTemplate,
}: EmailComposerProps) {
  const insertTag = (tag: string, target: 'subject' | 'body') => {
    if (target === 'subject') {
      setSubject(`${subject} ${tag}`.trim());
    } else {
      setBody(`${body} ${tag}`.trim());
    }
  };

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              2. Compose Message & Templates
            </CardTitle>
            <CardDescription className="text-xs">
              Select a pre-built template or craft a personalized broadcast message.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-1">
        {/* Template Selector */}
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5 text-muted-foreground">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            Quick Template Presets
          </Label>
          <Select value={selectedTemplateId} onValueChange={applyTemplate}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a template..." />
            </SelectTrigger>
            <SelectContent>
              {CRM_EMAIL_TEMPLATES.map((tmpl) => (
                <SelectItem key={tmpl.id} value={tmpl.id}>
                  <div className="flex flex-col text-left py-0.5">
                    <span className="font-medium text-xs">{tmpl.name}</span>
                    <span className="text-[11px] text-muted-foreground">{tmpl.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Dynamic Variable Insert Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 p-2 bg-muted/30 rounded-md border text-xs">
          <span className="text-muted-foreground flex items-center gap-1 font-medium text-[11px]">
            <Tag className="w-3 h-3" />
            Insert Tags:
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs font-mono"
            onClick={() => insertTag('{{name}}', 'body')}
          >
            {'{{name}}'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs font-mono"
            onClick={() => insertTag('{{tier}}', 'body')}
          >
            {'{{tier}}'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs font-mono"
            onClick={() => insertTag('{{email}}', 'body')}
          >
            {'{{email}}'}
          </Button>
        </div>

        {/* Subject */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="subject" className="text-xs">Subject Line</Label>
            <button
              type="button"
              onClick={() => insertTag('{{name}}', 'subject')}
              className="text-[11px] text-primary hover:underline"
            >
              + Add {'{{name}}'} to subject
            </button>
          </div>
          <Input
            id="subject"
            placeholder="e.g. Special Announcement for you, {{name}}!"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        {/* Body */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="body" className="text-xs">Email Message Content</Label>
            <span className="text-[11px] text-muted-foreground">{body.length} characters</span>
          </div>
          <Textarea
            id="body"
            rows={8}
            className="font-sans text-sm resize-y"
            placeholder="Type your message here..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
