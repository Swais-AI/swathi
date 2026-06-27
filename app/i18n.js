"use client";

import { createContext, useContext, useMemo, useState } from "react";

export const languageOptions = [
  { code: "English", label: "English", target: "English" },
  { code: "Hindi", label: "Hindi", target: "Hindi" },
  { code: "Telugu", label: "Telugu", target: "Telugu" }
];

const LanguageContext = createContext(null);

const translations = {
  English: {
    dashboard: "Dashboard",
    coreStudy: "Core Study",
    assignments: "Assignments",
    assessments: "Assessments",
    myProgress: "My Progress",
    settings: "Settings",
    helpSupport: "Help & Support",
    logout: "Logout",
    language: "Language",
    welcomeBack: "Welcome back,",
    rollNo: "Roll No.",
    admissionNo: "Admission No.",
    classLabel: "Class",
    section: "Section",
    studyA: "Study A: Core Material",
    studyB: "Study B: Assignment",
    studyC: "Study C: Assessment",
    chapters: "1) Chapters",
    studyMaterial: "2) Study Material",
    quizzes: "3) Quizzes",
    aiLearningPath: "4) AI Learning Path",
    myAssignments: "1) My Assignments",
    submitAssignment: "2) Submit Assignment",
    feedbackMarks: "3) Feedback & Marks",
    unitTest: "1) Unit Test",
    mockTest: "2) Mock Test",
    studentAnalysis: "4) Student Analysis",
    teacherRemark: "5) Teacher Remark"
  },
  Hindi: {
    dashboard: "डैशबोर्ड",
    coreStudy: "कोर स्टडी",
    assignments: "असाइनमेंट",
    assessments: "आकलन",
    myProgress: "मेरी प्रगति",
    settings: "सेटिंग्स",
    helpSupport: "सहायता",
    logout: "लॉगआउट",
    language: "भाषा",
    welcomeBack: "वापसी पर स्वागत है,",
    rollNo: "रोल नं.",
    admissionNo: "प्रवेश नं.",
    classLabel: "कक्षा",
    section: "सेक्शन",
    studyA: "अध्ययन A: मुख्य सामग्री",
    studyB: "अध्ययन B: असाइनमेंट",
    studyC: "अध्ययन C: आकलन",
    chapters: "1) अध्याय",
    studyMaterial: "2) अध्ययन सामग्री",
    quizzes: "3) क्विज़",
    aiLearningPath: "4) AI लर्निंग पाथ",
    myAssignments: "1) मेरे असाइनमेंट",
    submitAssignment: "2) असाइनमेंट जमा करें",
    feedbackMarks: "3) फीडबैक और अंक",
    unitTest: "1) यूनिट टेस्ट",
    mockTest: "2) मॉक टेस्ट",
    studentAnalysis: "4) छात्र विश्लेषण",
    teacherRemark: "5) शिक्षक टिप्पणी"
  },
  Telugu: {
    dashboard: "డ్యాష్‌బోర్డ్",
    coreStudy: "కోర్ స్టడీ",
    assignments: "అసైన్‌మెంట్లు",
    assessments: "మూల్యాంకనలు",
    myProgress: "నా పురోగతి",
    settings: "సెట్టింగ్స్",
    helpSupport: "సహాయం",
    logout: "లాగౌట్",
    language: "భాష",
    welcomeBack: "తిరిగి స్వాగతం,",
    rollNo: "రోల్ నం.",
    admissionNo: "అడ్మిషన్ నం.",
    classLabel: "తరగతి",
    section: "సెక్షన్",
    studyA: "స్టడీ A: ప్రధాన మెటీరియల్",
    studyB: "స్టడీ B: అసైన్‌మెంట్",
    studyC: "స్టడీ C: మూల్యాంకనం",
    chapters: "1) అధ్యాయాలు",
    studyMaterial: "2) అధ్యయన మెటీరియల్",
    quizzes: "3) క్విజ్‌లు",
    aiLearningPath: "4) AI లెర్నింగ్ పాథ్",
    myAssignments: "1) నా అసైన్‌మెంట్లు",
    submitAssignment: "2) అసైన్‌మెంట్ సమర్పించండి",
    feedbackMarks: "3) ఫీడ్‌బ్యాక్ & మార్కులు",
    unitTest: "1) యూనిట్ టెస్ట్",
    mockTest: "2) మాక్ టెస్ట్",
    studentAnalysis: "4) విద్యార్థి విశ్లేషణ",
    teacherRemark: "5) ఉపాధ్యాయ వ్యాఖ్య"
  }
};

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState("English");

  const value = useMemo(() => ({
    language,
    setLanguage,
    languageOptions,
    t(key) {
      return translations[language]?.[key] || translations.English[key] || key;
    }
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }
  return context;
}
