import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface FormattedDescriptionProps {
  text: string;
  maxInitialLines?: number;
}

export const FormattedDescription: React.FC<FormattedDescriptionProps> = ({
  text,
  maxInitialLines = 4,
}) => {
  const [expanded, setExpanded] = useState(false);

  if (!text || text.trim() === '') {
    return <p className="desc-empty">Walang karagdagang deskripsyon para sa produktong ito.</p>;
  }

  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const shouldTruncate = lines.length > maxInitialLines;
  const displayedLines = expanded || !shouldTruncate ? lines : lines.slice(0, maxInitialLines);

  return (
    <div className="formatted-desc-wrapper">
      <div className="formatted-desc-body">
        {displayedLines.map((line, idx) => {
          const trimmed = line.trim();
          const colonIndex = trimmed.indexOf(':');

          // Highlight spec keys if there is a colon
          if (colonIndex > 0 && colonIndex < 40) {
            const key = trimmed.substring(0, colonIndex + 1);
            const value = trimmed.substring(colonIndex + 1);
            return (
              <p key={idx} className="desc-line desc-spec-line">
                <span className="desc-spec-key">{key}</span>
                <span className="desc-spec-val">{value}</span>
              </p>
            );
          }

          // Bullet points
          if (trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.startsWith('*')) {
            return (
              <p key={idx} className="desc-line desc-bullet-line">
                <span className="bullet-dot">•</span>
                <span>{trimmed.replace(/^[-•*]\s*/, '')}</span>
              </p>
            );
          }

          return (
            <p key={idx} className="desc-line">
              {trimmed}
            </p>
          );
        })}
      </div>

      {shouldTruncate && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="btn-toggle-desc"
        >
          {expanded ? (
            <>
              <span>Ipakita ang Mas Kaunti</span>
              <ChevronUp size={16} />
            </>
          ) : (
            <>
              <span>Basahin ang Buong Detalye</span>
              <ChevronDown size={16} />
            </>
          )}
        </button>
      )}
    </div>
  );
};
