"use client";

import { useState, useRef, useEffect } from "react";

export function NumericInput({
  value,
  onChange,
  defaultValue = 0,
  ...props
}: {
  value: number;
  onChange: (value: number) => void;
  defaultValue?: number;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "defaultValue">) {
  const [display, setDisplay] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync display when value changes externally
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDisplay(String(value));
    }
  }, [value]);

  return (
    <input
      ref={inputRef}
      type="number"
      value={display}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        setDisplay(e.target.value);
        const num = Number(e.target.value);
        if (e.target.value !== "" && !isNaN(num)) {
          onChange(num);
        }
      }}
      onBlur={() => {
        if (display === "" || isNaN(Number(display))) {
          setDisplay(String(defaultValue));
          onChange(defaultValue);
        } else {
          setDisplay(String(Number(display)));
        }
      }}
      {...props}
    />
  );
}
