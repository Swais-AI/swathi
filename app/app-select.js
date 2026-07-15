"use client";

import { useId } from "react";
import Select, { components } from "react-select";

function DropdownIndicator(props) {
  return (
    <components.DropdownIndicator {...props}>
      <svg className="app-select-chevron" viewBox="0 0 20 20" aria-hidden="true">
        <path d="m5 7.5 5 5 5-5" />
      </svg>
    </components.DropdownIndicator>
  );
}

function SelectOption(props) {
  return (
    <components.Option {...props}>
      <span>{props.children}</span>
      {props.isSelected && (
        <svg className="app-select-check" viewBox="0 0 20 20" aria-hidden="true">
          <path d="m4.5 10.2 3.4 3.4 7.6-7.4" />
        </svg>
      )}
    </components.Option>
  );
}

const baseStyles = {
  control: (provided, state) => ({
    ...provided,
    minHeight: 46,
    borderRadius: 12,
    borderColor: state.isFocused ? "#5b8def" : "#cbd8e8",
    background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
    boxShadow: state.isFocused
      ? "0 0 0 3px rgba(0, 98, 255, 0.14), 0 8px 22px rgba(15, 23, 42, 0.08)"
      : "0 4px 14px rgba(15, 23, 42, 0.06)",
    cursor: state.isDisabled ? "not-allowed" : "pointer",
    transition: "border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease",
    "&:hover": { borderColor: state.isFocused ? "#5b8def" : "#9fb4cc" }
  }),
  valueContainer: (provided) => ({ ...provided, padding: "2px 14px" }),
  input: (provided) => ({ ...provided, color: "#07133c" }),
  singleValue: (provided) => ({ ...provided, color: "#07133c", fontWeight: 700 }),
  placeholder: (provided) => ({ ...provided, color: "#6b7890" }),
  indicatorSeparator: () => ({ display: "none" }),
  dropdownIndicator: (provided, state) => ({
    ...provided,
    padding: "0 12px",
    color: state.isFocused ? "#0062ff" : "#53617d",
    transition: "color 160ms ease"
  }),
  menu: (provided) => ({
    ...provided,
    zIndex: 80,
    marginTop: 8,
    overflow: "hidden",
    border: "1px solid #d7e1ed",
    borderRadius: 12,
    background: "#ffffff",
    boxShadow: "0 16px 38px rgba(15, 23, 42, 0.18)"
  }),
  menuList: (provided) => ({ ...provided, padding: 6 }),
  option: (provided, state) => ({
    ...provided,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 8,
    background: state.isSelected ? "#e9f1ff" : state.isFocused ? "#f2f6fc" : "#ffffff",
    color: state.isSelected ? "#0058db" : "#17233d",
    fontWeight: state.isSelected ? 800 : 600,
    cursor: "pointer",
    ":active": { background: "#e0ebff" }
  })
};

const darkStyles = {
  ...baseStyles,
  control: (provided, state) => ({
    ...baseStyles.control(provided, state),
    minHeight: 42,
    borderColor: state.isFocused ? "#60a5fa" : "rgba(148, 163, 184, 0.45)",
    background: "rgba(30, 41, 59, 0.82)",
    boxShadow: state.isFocused ? "0 0 0 3px rgba(96, 165, 250, 0.18)" : "none",
    "&:hover": { borderColor: "#60a5fa" }
  }),
  singleValue: (provided) => ({ ...provided, color: "#ffffff", fontWeight: 800 }),
  placeholder: (provided) => ({ ...provided, color: "#cbd5e1" }),
  dropdownIndicator: (provided, state) => ({
    ...baseStyles.dropdownIndicator(provided, state),
    color: "#dbeafe"
  }),
  input: (provided) => ({ ...provided, color: "#ffffff" }),
  menu: (provided) => ({
    ...baseStyles.menu(provided),
    borderColor: "rgba(148, 163, 184, 0.32)",
    background: "#111c35",
    boxShadow: "0 18px 42px rgba(2, 6, 23, 0.48)"
  }),
  menuList: (provided) => ({ ...provided, padding: 6, background: "#111c35" }),
  option: (provided, state) => ({
    ...baseStyles.option(provided, state),
    background: state.isSelected
      ? "rgba(37, 99, 235, 0.32)"
      : state.isFocused
        ? "rgba(148, 163, 184, 0.14)"
        : "#111c35",
    color: state.isSelected ? "#bfdbfe" : "#f8fafc",
    ":active": { background: "rgba(37, 99, 235, 0.4)" }
  })
};

export default function AppSelect({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Select...",
  ariaLabel,
  searchable = false,
  variant = "light",
  className = ""
}) {
  const instanceId = useId();
  const selectedOption = options.find((option) => String(option.value) === String(value)) || null;

  return (
    <Select
      instanceId={instanceId}
      inputId={`${instanceId}-input`}
      className={`app-select ${className}`}
      classNamePrefix="app-select"
      components={{ DropdownIndicator, Option: SelectOption }}
      value={selectedOption}
      options={options}
      onChange={(option) => onChange(option?.value ?? "")}
      isDisabled={disabled}
      isSearchable={searchable}
      placeholder={placeholder}
      aria-label={ariaLabel || placeholder}
      noOptionsMessage={() => "No options available"}
      styles={variant === "dark" ? darkStyles : baseStyles}
    />
  );
}
