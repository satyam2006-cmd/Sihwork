import { AppLanguage, AppLanguageCode } from '../types/medical';

export const APP_LANGUAGES: AppLanguage[] = [
  { code: 'gu-IN', label: 'Gujarati', nativeLabel: 'ગુજરાતી', chatgptName: 'Gujarati' },
  { code: 'mr-IN', label: 'Marathi', nativeLabel: 'मराठी', chatgptName: 'Marathi' },
  { code: 'hi-IN', label: 'Hindi', nativeLabel: 'हिन्दी', chatgptName: 'Hindi' },
  { code: 'en-IN', label: 'English', nativeLabel: 'English', chatgptName: 'Indian English' },
  { code: 'other', label: 'Other', nativeLabel: 'Other', chatgptName: 'the language specified by the user' },
];

export const DEFAULT_LANGUAGE_CODE: AppLanguageCode = 'hi-IN';

export function getLanguage(code: AppLanguageCode): AppLanguage {
  return APP_LANGUAGES.find(language => language.code === code) || APP_LANGUAGES[0];
}

export function getChatgptLanguageName(code: AppLanguageCode, otherLanguageName = ''): string {
  if (code === 'other') {
    return otherLanguageName.trim() || 'the language specified by the user';
  }
  return getLanguage(code).chatgptName;
}

export function getSpeechRecognitionLanguage(code: AppLanguageCode): string {
  return code === 'other' ? 'en-IN' : code;
}

export function getGoogleTtsLanguage(code: AppLanguageCode, otherLanguageName = ''): string {
  if (code === 'gu-IN') return 'gu';
  if (code === 'mr-IN') return 'mr';
  if (code === 'hi-IN') return 'hi';
  if (code === 'en-IN') return 'en';

  const normalized = otherLanguageName.trim().toLowerCase();
  const commonCodes: Record<string, string> = {
    bengali: 'bn',
    bangla: 'bn',
    kannada: 'kn',
    malayalam: 'ml',
    odia: 'or',
    oriya: 'or',
    punjabi: 'pa',
    tamil: 'ta',
    telugu: 'te',
    urdu: 'ur',
  };
  return commonCodes[normalized] || 'en';
}

export function getPatientUiCopy(code: AppLanguageCode) {
  if (code === 'gu-IN') {
    return {
      pageTitle: 'દર્દી ચેક-ઇન',
      chooseLanguage: 'ભાષા પસંદ કરો',
      languageHelp: 'ઇન્ટરવ્યુ, માઇક્રોફોન અને અવાજ આ ભાષામાં રહેશે.',
      startSession: 'દર્દી સેશન શરૂ કરો',
      patientFlow: 'દર્દી ચેક-ઇન ફ્લો',
      doctorDashboard: 'ડોક્ટર ડેશબોર્ડ',
      stepConverse: 'વાતચીત',
      stepScan: 'રેકોર્ડ સ્કેન',
      stepRoute: 'સારાંશ અને રૂટ',
      interviewTitle: 'ક્લિનિકલ ઇન્ટરવ્યુ',
      profileDirective: 'દર્દી પ્રોફાઇલ',
      aiBackend: 'AI બેકએન્ડ',
      clinicalAi: 'ક્લિનિકલ AI',
      listening: 'સાંભળી રહ્યું છે...',
      analyzing: 'ક્લિનિકલ માહિતી વાંચી રહ્યું છે...',
      inputPlaceholder: 'માઇકથી બોલો અથવા અહીં જવાબ લખો...',
      micHelp: 'Start દબાવી બોલો, જવાબ પૂરો થાય ત્યારે Stop દબાવો, પછી તપાસીને Send કરો.',
      finished: 'ઇન્ટરવ્યુ પૂર્ણ થયું',
      triageCategory: 'ટ્રાયેજ કેટેગરી',
      chiefComplaint: 'મુખ્ય ફરિયાદ',
      hpiSnippet: 'રચાયેલ ઇતિહાસ',
      proceedScan: 'Step 3: મેડિકલ રેકોર્ડ સ્કેન કરો',
    };
  }

  if (code === 'mr-IN') {
    return {
      pageTitle: 'रुग्ण चेक-इन',
      chooseLanguage: 'भाषा निवडा',
      languageHelp: 'इंटरव्ह्यू, मायक्रोफोन आणि आवाज या भाषेत चालतील.',
      startSession: 'रुग्ण सत्र सुरू करा',
      patientFlow: 'रुग्ण चेक-इन फ्लो',
      doctorDashboard: 'डॉक्टर डॅशबोर्ड',
      stepConverse: 'संवाद',
      stepScan: 'रेकॉर्ड स्कॅन',
      stepRoute: 'सारांश आणि रूट',
      interviewTitle: 'क्लिनिकल इंटरव्ह्यू',
      profileDirective: 'रुग्ण प्रोफाइल',
      aiBackend: 'AI बॅकएंड',
      clinicalAi: 'क्लिनिकल AI',
      listening: 'ऐकत आहे...',
      analyzing: 'क्लिनिकल माहिती वाचत आहे...',
      inputPlaceholder: 'माइकने बोला किंवा येथे उत्तर लिहा...',
      micHelp: 'Start दाबून बोला, उत्तर पूर्ण झाल्यावर Stop दाबा, मग तपासून Send करा.',
      finished: 'इंटरव्ह्यू पूर्ण झाला',
      triageCategory: 'ट्रायेज श्रेणी',
      chiefComplaint: 'मुख्य तक्रार',
      hpiSnippet: 'रचलेला इतिहास',
      proceedScan: 'Step 3: मेडिकल रेकॉर्ड स्कॅन करा',
    };
  }

  if (code === 'hi-IN') {
    return {
      pageTitle: 'मरीज चेक-इन',
      chooseLanguage: 'भाषा चुनें',
      languageHelp: 'इंटरव्यू, माइक्रोफोन और आवाज इसी भाषा में चलेंगे।',
      startSession: 'मरीज सेशन शुरू करें',
      patientFlow: 'मरीज चेक-इन फ्लो',
      doctorDashboard: 'डॉक्टर डैशबोर्ड',
      stepConverse: 'बातचीत',
      stepScan: 'रिकॉर्ड स्कैन',
      stepRoute: 'सारांश और रूट',
      interviewTitle: 'क्लिनिकल इंटरव्यू',
      profileDirective: 'मरीज प्रोफाइल',
      aiBackend: 'AI बैकएंड',
      clinicalAi: 'क्लिनिकल AI',
      listening: 'सुन रहा है...',
      analyzing: 'क्लिनिकल जानकारी पढ़ रहा है...',
      inputPlaceholder: 'माइक से बोलें, या यहां जवाब टाइप करें...',
      micHelp: 'Start से बोलना शुरू करें, जवाब पूरा होने पर Stop दबाएं, फिर जांचकर Send करें।',
      finished: 'इंटरव्यू पूरा हुआ',
      triageCategory: 'ट्रायेज श्रेणी',
      chiefComplaint: 'मुख्य शिकायत',
      hpiSnippet: 'संरचित इतिहास',
      proceedScan: 'Step 3: मेडिकल रिकॉर्ड स्कैन करें',
    };
  }

  return {
    pageTitle: 'Patient Check-In',
    chooseLanguage: 'Choose Language',
    languageHelp: 'The interview, microphone, and voice output will use this language.',
    startSession: 'Start Patient Session',
    patientFlow: 'Patient Check-In Flow',
    doctorDashboard: 'Doctor Dashboard',
    stepConverse: 'Converse',
    stepScan: 'Scan Records',
    stepRoute: 'Summarize & Route',
    interviewTitle: 'Clinical Interview',
    profileDirective: 'Patient Profile',
    aiBackend: 'AI Backend',
    clinicalAi: 'Clinical AI',
    listening: 'Listening...',
    analyzing: 'AI analyzing clinical clues...',
    inputPlaceholder: 'Speak using mic, or type details here...',
    micHelp: 'Use Start to capture, Stop when the patient is done, then review and Send.',
    finished: 'Interview completed successfully',
    triageCategory: 'Triage Category',
    chiefComplaint: 'Chief Complaint',
    hpiSnippet: 'Structured HPI Snippet',
    proceedScan: 'Proceed to Step 3: Scan Medical Records',
  };
}

export function getInitialGreeting(code: AppLanguageCode): string {
  if (code === 'gu-IN') {
    return 'નમસ્તે, હું તમારો ક્લિનિકલ ઇન્ટેક સહાયક છું. આજે તમને કઈ મુખ્ય સમસ્યા અથવા લક્ષણો છે?';
  }
  if (code === 'mr-IN') {
    return 'नमस्कार, मी तुमचा क्लिनिकल इंटेक असिस्टंट आहे. आज तुम्हाला मुख्य समस्या किंवा लक्षणे कोणती आहेत?';
  }
  if (code === 'hi-IN') {
    return 'नमस्ते, मैं आपका क्लिनिकल इंटेक असिस्टेंट हूं। आज आपको कौन सी मुख्य समस्या या लक्षण हैं?';
  }
  return 'Hello, I am your clinical intake assistant. What symptoms or medical concern brought you here today?';
}

export function getLanguagePromptInstruction(code: AppLanguageCode, otherLanguageName = ''): string {
  const languageName = getChatgptLanguageName(code, otherLanguageName);
  return `The selected patient language is ${languageName} (${code}). Ask every patient-facing question in ${languageName}. Keep the JSON keys in English, but values such as "question" should be in ${languageName}.`;
}
