'use client';
import { useState, useRef, useEffect, useCallback } from 'react';

interface Props {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  suggestions: string[];
  placeholder?: string;
  maxVisible?: number;
}

export default function AutocompleteTagInput({
  tags, onTagsChange, suggestions, placeholder = 'Type to search or add…', maxVisible = 8,
}: Props) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = suggestions
    .filter(s => !tags.includes(s))
    .filter(s => !input || s.toLowerCase().includes(input.toLowerCase()))
    .slice(0, maxVisible);

  const showAdd =
    input.trim().length > 1 &&
    !tags.includes(input.trim()) &&
    !suggestions.some(s => s.toLowerCase() === input.trim().toLowerCase());

  const dropdownItems = [...filtered, ...(showAdd ? [`__add__${input.trim()}`] : [])];

  const addTag = useCallback((value: string) => {
    const v = value.startsWith('__add__') ? value.slice(7) : value;
    const trimmed = v.trim();
    if (trimmed && !tags.includes(trimmed)) onTagsChange([...tags, trimmed]);
    setInput('');
    setOpen(false);
    setCursor(-1);
    inputRef.current?.focus();
  }, [tags, onTagsChange]);

  const removeTag = (tag: string) => onTagsChange(tags.filter(t => t !== tag));

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (cursor >= 0 && cursor < dropdownItems.length) {
        addTag(dropdownItems[cursor]);
      } else if (input.trim()) {
        addTag(input);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setCursor(c => Math.min(c + 1, dropdownItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor(c => Math.max(c - 1, -1));
    } else if (e.key === 'Escape') {
      setOpen(false);
      setCursor(-1);
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isOpen = open && dropdownItems.length > 0;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div
        className={`tags-input ${isOpen ? 'tags-input--open' : ''}`}
        onClick={() => { inputRef.current?.focus(); setOpen(true); }}
      >
        {tags.map(tag => (
          <span key={tag} className="tag">
            {tag}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); removeTag(tag); }}
              aria-label={`Remove ${tag}`}
            >×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={e => { setInput(e.target.value); setOpen(true); setCursor(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="tag-input"
          style={{ minWidth: 120, flex: 1 }}
          autoComplete="off"
        />
      </div>

      {isOpen && (
        <div className="ac-dropdown" role="listbox">
          {filtered.map((item, i) => {
            const idx = i;
            const hl = item.toLowerCase().indexOf(input.toLowerCase());
            return (
              <div
                key={item}
                role="option"
                aria-selected={cursor === idx}
                className={`ac-option${cursor === idx ? ' ac-option--hl' : ''}`}
                onMouseDown={e => { e.preventDefault(); addTag(item); }}
                onMouseEnter={() => setCursor(idx)}
              >
                {hl >= 0 && input ? (
                  <>
                    {item.slice(0, hl)}
                    <mark>{item.slice(hl, hl + input.length)}</mark>
                    {item.slice(hl + input.length)}
                  </>
                ) : item}
              </div>
            );
          })}
          {showAdd && (
            <div
              role="option"
              aria-selected={cursor === filtered.length}
              className={`ac-option ac-option--add${cursor === filtered.length ? ' ac-option--hl' : ''}`}
              onMouseDown={e => { e.preventDefault(); addTag(input); }}
              onMouseEnter={() => setCursor(filtered.length)}
            >
              <span className="ac-add-icon">+</span> Add &ldquo;{input.trim()}&rdquo;
            </div>
          )}
        </div>
      )}
    </div>
  );
}
