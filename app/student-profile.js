"use client";

import { useEffect, useState } from "react";
import { getApiBaseUrl } from "./api-base-url";
import { useLanguage } from "./i18n";

const API_BASE_URL = getApiBaseUrl();
const fallbackStudent = {
  full_name: "Student",
  roll_no: "-",
  admission_no: "-",
  class_name: "-",
  section: "-"
};

export default function StudentProfile() {
  const [student, setStudent] = useState(fallbackStudent);
  const { t } = useLanguage();

  useEffect(() => {
    let cancelled = false;

    async function loadStudent() {
      try {
        const response = await fetch(`${API_BASE_URL}/students/current`);
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.student) {
          return;
        }

        if (!cancelled) {
          setStudent({ ...fallbackStudent, ...data.student });
        }
      } catch {
        if (!cancelled) {
          setStudent(fallbackStudent);
        }
      }
    }

    loadStudent();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="student-info">
      <p>{t("welcomeBack")}</p>
      <h1>{student.full_name}</h1>
      <div className="chips">
        <span>{t("rollNo")}: {student.roll_no}</span>
        <span>{t("admissionNo")}: {student.admission_no}</span>
        <span>{t("classLabel")}: {student.class_name}</span>
        <span>{t("section")}: {student.section}</span>
      </div>
    </div>
  );
}
