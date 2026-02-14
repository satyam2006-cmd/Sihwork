import { Button } from "@/components/ui/button";

interface LanguageSwitcherProps {
  value: string;
  onChange: (lang: string) => void;
}

export function LanguageSwitcher({ value, onChange }: LanguageSwitcherProps) {
  return (
    <div className="flex rounded-md border overflow-hidden">
      <Button
        variant={value === "en" ? "default" : "ghost"}
        size="sm"
        className="rounded-none"
        onClick={() => onChange("en")}
      >
        EN
      </Button>
      <Button
        variant={value === "hi" ? "default" : "ghost"}
        size="sm"
        className="rounded-none"
        onClick={() => onChange("hi")}
      >
        HI
      </Button>
    </div>
  );
}
