import { useMemo } from 'react';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { cn } from '@/lib/utils';
import type { PluginSchemaField } from './api';

interface SchemaFieldProps {
  nameKey: string;
  schema: PluginSchemaField;
  value: unknown;
  onChange: (value: unknown) => void;
  depth?: number;
}

const inputClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-50';

const textareaClass =
  'w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs leading-relaxed shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30';

function asText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function asListText(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => (item && typeof item === 'object' ? asText(item) : String(item)))
      .join('\n');
  }
  return asText(value);
}

function optionsOf(schema: PluginSchemaField): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (const option of schema.options || []) {
    if (option && typeof option === 'object') {
      const rec = option as Record<string, unknown>;
      const value = rec.value ?? rec.name ?? rec.label;
      const label = rec.label ?? rec.name ?? rec.value;
      out.push({ value: String(value ?? ''), label: String(label ?? '') });
    } else {
      out.push({ value: String(option), label: String(option) });
    }
  }
  return out;
}

/**
 * One row of an AstrBot plugin `_conf_schema.json` rendered as a form control.
 * Recurses for `object` / `dict` nodes.
 */
export function SchemaField({ nameKey, schema, value, onChange, depth = 0 }: SchemaFieldProps) {
  const type = (schema.type || 'string').toLowerCase();
  const label = schema.description || nameKey;
  const hint = schema.hint || '';
  const options = useMemo(() => optionsOf(schema), [schema]);
  const children = useMemo(() => Object.entries(schema.items || {}), [schema.items]);

  const labelNode = (
    <div className="flex flex-col gap-1">
      <span className="text-[12.5px] font-medium text-foreground/85">{label}</span>
      {hint ? <span className="text-[11.5px] leading-relaxed text-muted-foreground">{hint}</span> : null}
    </div>
  );

  if ((type === 'object' || type === 'dict') && children.length && !schema.editor_mode) {
    return (
      <div className="mb-3">
        {labelNode}
        <div
          className={cn(
            'mt-2 flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/40 p-3',
            depth > 0 && 'bg-muted/20',
          )}
        >
          {children.map(([key, child]) => (
            <SchemaField
              key={key}
              nameKey={key}
              schema={child}
              value={(value as Record<string, unknown> | undefined)?.[key]}
              onChange={(next) => {
                const base =
                  value && typeof value === 'object' && !Array.isArray(value)
                    ? { ...(value as Record<string, unknown>) }
                    : {};
                base[key] = next;
                onChange(base);
              }}
              depth={depth + 1}
            />
          ))}
        </div>
      </div>
    );
  }

  if (type === 'bool') {
    return (
      <div className="mb-3 flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <ToggleSwitch
            value={Boolean(value)}
            onChange={(next) => onChange(next)}
            ariaLabel={label}
          />
          <span className="text-[12.5px] text-muted-foreground">{value ? '已开启' : '已关闭'}</span>
        </div>
        <span className="text-[12.5px] font-medium text-foreground/85">{label}</span>
        {hint ? <span className="text-[11.5px] leading-relaxed text-muted-foreground">{hint}</span> : null}
      </div>
    );
  }

  if (type === 'select' && options.length) {
    return (
      <div className="mb-3 flex flex-col gap-1.5">
        {labelNode}
        <select
          className={inputClass}
          value={asText(value)}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (type === 'list' || type === 'array') {
    // A list of objects cannot survive the line-per-item editor (every entry
    // would be flattened into a string), so those are edited as JSON.
    const complex = Array.isArray(value) && value.some((item) => item && typeof item === 'object');
    return (
      <div className="mb-3 flex flex-col gap-1.5">
        {labelNode}
        {complex ? (
          <span className="text-[11px] text-muted-foreground">结构化列表：请用 JSON 编辑，逐行编辑会丢失字段</span>
        ) : null}
        <textarea
          className={textareaClass}
          style={{ minHeight: 74 }}
          value={complex ? asText(value) : asListText(value)}
          placeholder={complex ? 'JSON 数组' : '每行一项'}
          onChange={(event) => {
            if (!complex) {
              onChange(
                event.target.value
                  .split('\n')
                  .map((line) => line.trim())
                  .filter((line) => line.length),
              );
              return;
            }
            try {
              onChange(JSON.parse(event.target.value));
            } catch {
              onChange(event.target.value);
            }
          }}
        />
      </div>
    );
  }

  if (type === 'text' || schema.editor_mode) {
    return (
      <div className="mb-3 flex flex-col gap-1.5">
        {labelNode}
        <textarea
          className={textareaClass}
          style={{ minHeight: schema.editor_mode ? 140 : 96 }}
          value={asText(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    );
  }

  if (type === 'int' || type === 'float') {
    return (
      <div className="mb-3 flex flex-col gap-1.5">
        {labelNode}
        <input
          className={inputClass}
          type="number"
          value={asText(value)}
          onChange={(event) => {
            const raw = event.target.value;
            if (raw === '') return onChange('');
            const parsed = type === 'int' ? parseInt(raw, 10) : parseFloat(raw);
            onChange(Number.isNaN(parsed) ? raw : parsed);
          }}
        />
      </div>
    );
  }

  if (type === 'object' || type === 'dict') {
    return (
      <div className="mb-3 flex flex-col gap-1.5">
        {labelNode}
        <textarea
          className={textareaClass}
          style={{ minHeight: 74 }}
          value={asText(value)}
          onChange={(event) => {
            try {
              onChange(JSON.parse(event.target.value));
            } catch {
              onChange(event.target.value);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="mb-3 flex flex-col gap-1.5">
      {labelNode}
      <input
        className={inputClass}
        type={schema.is_password ? 'password' : 'text'}
        value={asText(value)}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}