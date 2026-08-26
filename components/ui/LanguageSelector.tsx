import * as React from "react";

export type SmartTableLanguage = "en" | "es" | "hu";

type LanguageSelectorProps = {
  currentLanguage: SmartTableLanguage;
  onLanguageChange: (language: SmartTableLanguage) => void | Promise<void>;
};

const languages: Array<{ code: SmartTableLanguage; shortLabel: string; optionLabel: string }> = [
  { code: "en", shortLabel: "English", optionLabel: "English 🇺🇸" },
  { code: "es", shortLabel: "Español", optionLabel: "Español 🇪🇸" },
  { code: "hu", shortLabel: "Magyar", optionLabel: "Magyar 🇭🇺" }
];

export function LanguageSelector({ currentLanguage, onLanguageChange }: LanguageSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const activeLanguage = languages.find((language) => language.code === currentLanguage) || languages[0];

  React.useEffect(() => {
    function onDocumentPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocumentPointerDown);
    return () => document.removeEventListener("mousedown", onDocumentPointerDown);
  }, []);

  function focusOption(index: number) {
    const options = optionRefs.current.filter(Boolean) as HTMLButtonElement[];
    if (!options.length) return;
    options[(index + options.length) % options.length]?.focus();
  }

  async function selectLanguage(language: SmartTableLanguage) {
    setOpen(false);
    await onLanguageChange(language);
    buttonRef.current?.focus();
  }

  return (
    <div className="language-selector" data-language-selector ref={rootRef}>
      <button
        ref={buttonRef}
        className="ghost-button language-selector__button"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="languageSelectorMenu"
        aria-label={`Language: ${activeLanguage.shortLabel}`}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => focusOption(languages.findIndex((language) => language.code === currentLanguage)));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => focusOption(languages.length - 1));
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      >
        <span aria-hidden="true">🌐</span>
        <span className="language-selector__label">Language</span>
        <span className="language-selector__divider" aria-hidden="true">|</span>
        <span className="language-selector__current">{activeLanguage.shortLabel}</span>
        <span className="language-selector__chevron" aria-hidden="true">▼</span>
      </button>
      <div
        className="language-selector__menu"
        id="languageSelectorMenu"
        role="listbox"
        aria-label="Choose language"
        tabIndex={-1}
        hidden={!open}
      >
        {languages.map((language, index) => {
          const selected = language.code === currentLanguage;
          return (
            <button
              key={language.code}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              className={`language-selector__option${selected ? " active" : ""}`}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => void selectLanguage(language.code)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  focusOption(index + 1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  focusOption(index - 1);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  focusOption(0);
                } else if (event.key === "End") {
                  event.preventDefault();
                  focusOption(languages.length - 1);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setOpen(false);
                  buttonRef.current?.focus();
                }
              }}
            >
              <span className="language-selector__check" aria-hidden="true">{selected ? "✓" : ""}</span>
              <span>{language.optionLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default LanguageSelector;
