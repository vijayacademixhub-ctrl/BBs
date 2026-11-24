/**
 * Register records imported from the team's Master Index workbook.
 *
 * GENERATED FILE — produced by scripts/import_master_index.py from
 * docs/source-data/Master_Index.xlsx. Edit the workbook and re-run the
 * importer rather than editing this file by hand.
 *
 * It lives outside apps/web deliberately. This is the team's real index —
 * staff names, allocations and Drive folder links — and while it sat in the
 * browser's source tree it was compiled into the published bundle, where
 * anyone who opened the site could read all of it without signing in. It is
 * now imported only by the server function in api/import-registers.ts, which
 * runs on the deployment and never ships to a browser.
 *
 * This is the starting content of the registers, not a fixed table: every
 * value here can be edited in the application, and both records and columns
 * can be added. Hyperlink targets are carried across from the workbook, so a
 * Drive link opens the same folder it opened in Excel.
 */

export interface SeedRecord {
  values: Record<string, string>
}

export const REGISTER_SEED_RECORDS: Record<string, SeedRecord[]> = {
  "documents": [
    { values: { "serial": "1", "name": "CMS ALL DOCUMENTS", "driveLink": "https://drive.google.com/drive/folders/19axdqsNR7ciJJ9D2_vbCuSB4MiLRva-r?usp=drive_link", "driveLabel": "CMS ALL DOCUMENTS", "status": "Active", "owner": "Vijay" } },
    { values: { "serial": "2", "name": "BBA Lalbagh Calendar of Events Dashboard 2026-27", "sharedBy": "Shared by Dr. Shradha Kanwar", "format": "Google Sheet", "driveLink": "https://drive.google.com/drive/folders/1Sm0IrawoQFEia1MiMCpV4FcmAPtL8UM1?usp=drive_link", "driveLabel": "BBA Lalbagh Calendar of Events Dashboard", "status": "Active", "owner": "Vijay", "lastUpdated": "2026-10-28" } },
    { values: { "serial": "3", "name": "Area wise Monthly Progress Update", "sharedBy": "Area Chairs", "format": "Pptx", "driveLink": "https://drive.google.com/drive/folders/1vGDU3uUuU41Sn90R9XsKdBqA0G9TBOSp?usp=drive_link", "driveLabel": "Area wise Monthly Progress Update", "status": "Unconfirmed", "owner": "Vijay", "lastUpdated": "2026-10-28" } },
    { values: { "serial": "4", "name": "General Studies", "sharedBy": "Area Chairs", "format": "Pptx", "driveLink": "https://drive.google.com/drive/folders/1uXKcwCvw4e3_fxvQ2W6t-5LZ-FKKtdfz?usp=drive_link", "driveLabel": "General Studies", "status": "Unconfirmed", "owner": "Vijay", "lastUpdated": "2026-10-28" } },
    { values: { "serial": "5", "name": "Marketing", "sharedBy": "Area Chairs", "format": "Pptx", "driveLink": "https://drive.google.com/drive/folders/1VxUBG7wPo-xYq9-YM9ClsCshX59n6R5E?usp=drive_link", "driveLabel": "Marketing", "status": "Unconfirmed", "owner": "Vijay", "lastUpdated": "2026-10-28" } },
    { values: { "serial": "6", "name": "Finance", "sharedBy": "Area Chairs", "format": "Pptx", "driveLink": "https://drive.google.com/drive/folders/1-gqjSUp4TxWq_26EV4dgqy_u7qNLxZjC?usp=drive_link", "driveLabel": "Finance", "status": "Unconfirmed", "owner": "Vijay", "lastUpdated": "2026-10-28" } },
    { values: { "serial": "7", "name": "Business Analytics", "sharedBy": "Area Chairs", "format": "Pptx", "driveLink": "https://drive.google.com/drive/folders/1SPRbpBWIuDV_nW9bYfYvD7H5EQ_Bvm_s?usp=drive_link", "driveLabel": "Business Analytics", "status": "Unconfirmed", "owner": "Vijay" } },
    { values: { "serial": "8", "name": "HR", "sharedBy": "Area Chairs", "format": "Pptx", "driveLink": "https://drive.google.com/drive/folders/1WN2cuLmi7s-cGQwEHMttUC6cJEsJX717?usp=drive_link", "driveLabel": "HR", "status": "Unconfirmed", "owner": "Vijay" } },
    { values: { "serial": "9", "name": "WOW", "sharedBy": "Area Chairs", "format": "Pptx", "driveLink": "https://drive.google.com/drive/folders/1oOnmq_ZDAKilMicCpIybqI3RkxL2N4xF?usp=drive_link", "driveLabel": "WOW", "status": "Unconfirmed", "owner": "Vijay" } },
    { values: { "serial": "10", "name": "Curriculum Revision - Year 2 & Year 3", "sharedBy": "Area Chairs", "format": "Pptx", "driveLink": "https://drive.google.com/drive/folders/1vsKMsC7WucOkAc9dPEkjQRKThKs74f9z?usp=drive_link", "driveLabel": "Curriculum Revision - Year 2 & Year 3", "status": "Unconfirmed", "owner": "Vijay" } },
    { values: { "serial": "11", "name": "General Studies", "sharedBy": "Area Chairs", "format": "Pptx", "driveLink": "https://drive.google.com/drive/folders/1tTLc1zJ153w9PltwppJUwd5dwO6yUzEz?usp=drive_link", "driveLabel": "General Studies", "status": "Unconfirmed", "owner": "Vijay" } },
    { values: { "serial": "12", "name": "Marketing", "sharedBy": "Area Chairs", "format": "Pptx", "driveLink": "https://drive.google.com/drive/folders/1ncdPqRK2DArgIjlZH5q_vJKzK9fM_juS?usp=drive_link", "driveLabel": "Marketing", "status": "Unconfirmed", "owner": "Vijay" } },
    { values: { "serial": "13", "name": "Finance", "sharedBy": "Area Chairs", "format": "Pptx", "driveLink": "https://drive.google.com/drive/folders/1T66292pKH2Jt2kemTM-8jzhULGNWsvFR?usp=drive_link", "driveLabel": "Finance", "status": "Unconfirmed", "owner": "Vijay" } },
    { values: { "serial": "14", "name": "Business Analytics", "sharedBy": "Area Chairs", "format": "Pptx", "driveLink": "https://drive.google.com/drive/folders/1FsWRQqh8QX2nInRzI6_mAjJKdCdBNoIx?usp=drive_link", "driveLabel": "Business Analytics", "status": "Unconfirmed", "owner": "Vijay" } },
    { values: { "serial": "15", "name": "HR", "sharedBy": "Area Chairs", "format": "Pptx", "driveLink": "https://drive.google.com/drive/folders/1POWuFeJQ2KUlINGrUfsa4t4ZfZ57RJ9I?usp=drive_link", "driveLabel": "HR", "status": "Unconfirmed", "owner": "Vijay" } },
    { values: { "serial": "16", "name": "WOW", "sharedBy": "Area Chairs", "format": "Pptx", "driveLink": "https://drive.google.com/drive/folders/1NDJyUoFrZKIFnV_YETqdFcVAvF0o9yza?usp=drive_link", "driveLabel": "WOW", "status": "Unconfirmed", "owner": "Vijay" } },
    { values: { "serial": "17", "name": "Commtiee_Monthly_Progress_Update", "sharedBy": "Commtiee Head & Team Members", "format": "Pptx", "driveLink": "https://drive.google.com/drive/folders/1puIdvgK5Z8tfhpwcZWu0ETjDIaWWWd1i?usp=drive_link", "driveLabel": "Commtiee_Monthly_Progress_Update", "status": "Unconfirmed", "owner": "Vijay" } },
    { values: { "serial": "18", "name": "July 2026", "sharedBy": "Commtiee Head & Team Members", "format": "Pptx", "driveLink": "https://drive.google.com/drive/folders/1fHuylHbh2XcFxYMhS1nJfQPkBmeZock7?usp=drive_link", "driveLabel": "July 2026", "status": "Unconfirmed", "owner": "Vijay" } },
    { values: { "serial": "19", "name": "June 2026", "sharedBy": "Commtiee Head & Team Members", "format": "Pptx", "driveLink": "https://drive.google.com/drive/folders/12GPpU9S3vWo5UvUcYZw-ZkpxhFlr6LvY?usp=drive_link", "driveLabel": "June 2026", "status": "Unconfirmed", "owner": "Vijay" } },
    { values: { "serial": "20", "name": "October 2026", "sharedBy": "Commtiee Head & Team Members", "format": "Pptx", "driveLink": "https://drive.google.com/drive/folders/1Xjr65oM-VbBq3q69-ZZFtqsDAF6vvi6J?usp=drive_link", "driveLabel": "Oct 2026", "status": "Unconfirmed", "owner": "Vijay" } },
    { values: { "serial": "19", "name": "November 2026", "sharedBy": "Commtiee Head & Team Members", "format": "Pptx", "driveLink": "https://drive.google.com/drive/folders/1xBprw9_dFRn3uxzC8Zsnhm_kBdWC3Wgi?usp=drive_link", "driveLabel": "Nov 2026", "status": "Unconfirmed", "owner": "Vijay" } },
    { values: { "serial": "20", "name": "December 2026", "sharedBy": "Commtiee Head & Team Members", "format": "Pptx", "driveLink": "https://drive.google.com/drive/folders/1f27ejbaFiIl-730oj0TS2OxS3cHyVpgw?usp=drive_link", "driveLabel": "Dec 2026", "status": "Unconfirmed", "owner": "Vijay" } },
    { values: { "serial": "21", "name": "MoM Area Wise", "sharedBy": "Academic Assistants", "format": "Docx", "driveLink": "https://drive.google.com/drive/folders/1gu_mdaIW-ON7wv-wX91kalCY2FN4ZuFn?usp=drive_link", "driveLabel": "MoM's Area wise", "status": "Unconfirmed", "owner": "Yamini" } },
    { values: { "serial": "22", "name": "General Studies", "sharedBy": "Academic Assistants", "format": "Docx", "driveLink": "https://drive.google.com/drive/folders/1Y2wTRX0BTeE5wwbR8syc25E7sZqRCLgs?usp=drive_link", "driveLabel": "General Studies", "status": "Unconfirmed", "owner": "Yamini" } },
    { values: { "serial": "23", "name": "Marketing", "sharedBy": "Academic Assistants", "format": "Docx", "driveLink": "https://drive.google.com/drive/folders/1cIeA46kKD92HMZI1nPkXL4pMJ4d3LIv_?usp=drive_link", "driveLabel": "Marketing", "status": "Unconfirmed", "owner": "Yamini" } },
    { values: { "serial": "24", "name": "Finance", "sharedBy": "Academic Assistants", "format": "Docx", "driveLink": "https://drive.google.com/drive/folders/185GR60w3Nj83hEj9drqjuoixnOmeeSOo?usp=drive_link", "driveLabel": "Finance", "status": "Unconfirmed", "owner": "Yamini" } },
    { values: { "serial": "25", "name": "Business Analytics", "sharedBy": "Academic Assistants", "format": "Docx", "driveLink": "https://drive.google.com/drive/folders/1u2OUMzrbCi-Sw4NrDqVoAiqnF6EBx7B5?usp=drive_link", "driveLabel": "Business Analytics", "status": "Unconfirmed", "owner": "Yamini" } },
    { values: { "serial": "26", "name": "HR", "sharedBy": "Academic Assistants", "format": "Docx", "driveLink": "https://drive.google.com/drive/folders/1Y6w7UuZlBDqRZZKREyfnH2YeSLl2WanM?usp=drive_link", "driveLabel": "HR", "status": "Unconfirmed", "owner": "Yamini" } },
    { values: { "serial": "27", "name": "WOW", "sharedBy": "Academic Assistants", "format": "Docx", "driveLink": "https://drive.google.com/drive/folders/18t2lvNJRKtFSfT2Jax85w4oSZaKjERNh?usp=drive_link", "driveLabel": "WOW", "status": "Unconfirmed", "owner": "Yamini" } },
    { values: { "serial": "28", "name": "BBA Work Allocation – Baseline Builders", "sharedBy": "Baseline Builders Team", "format": "Xlsx", "sheetLink": "Work Allocation", "status": "Active", "owner": "Vijay", "lastUpdated": "2026-11-20", "remarks": "Task tracker for Vijay, Karshima, Yamini, Hepsi; links back to this index" } },
    { values: { "serial": "29", "name": "BBA Member Summary", "sharedBy": "Baseline Builders Team", "format": "Xlsx", "sheetLink": "Member Summary", "status": "Active", "owner": "Vijay", "lastUpdated": "2026-11-20", "remarks": "Per-member and per-workstream task counts (formulas)" } },
    { values: { "serial": "30", "name": "BBA Weekly Review", "sharedBy": "Baseline Builders Team", "format": "Xlsx", "sheetLink": "Weekly Review", "status": "Active", "owner": "Vijay", "lastUpdated": "2026-11-20", "remarks": "Weekly meeting log: done, progress, pending, next plan" } },
    { values: { "serial": "31", "name": "BBA Source Map", "sharedBy": "Baseline Builders Team", "format": "Xlsx", "sheetLink": "Source Map", "status": "Active", "owner": "Vijay", "lastUpdated": "2026-11-20", "remarks": "Whiteboard, checklist and handwritten notes mapped to task IDs" } },
  ],
  "work-allocation": [
    { values: { "ref": "T01", "workstream": "Records & Data Collection", "task": "Record of all BBA activities and plan till now (incl. previous semester records)", "primaryOwner": "Karshima", "support": "Yamini", "priority": "High", "status": "Not Started", "sourceRef": "WB-2, BN-2, HW-1", "remarks": "Joint with Yamini; primary set by the order written on the whiteboard [Kar, Yamu]. Feeds Vijay's analysis." } },
    { values: { "ref": "T02", "workstream": "Records & Data Collection", "task": "Collect monthly reports from Area Chairs: micro-credentials, internship, mentoring", "primaryOwner": "Yamini", "support": "Karshima", "stakeholder": "Area Chairs", "priority": "High", "status": "Not Started", "sourceRef": "BN-3, HW-2", "relatedDocument": "Area wise Monthly Progress Update", "remarks": "Joint with Karshima [Yamu, Karshim] per handwritten note." } },
    { values: { "ref": "T03", "workstream": "Records & Data Collection", "task": "Collect data from Committee members: review and monthly meeting data points", "primaryOwner": "Vijay", "stakeholder": "Committee Members", "priority": "Medium", "status": "Not Started", "sourceRef": "WB-3, BN-4", "relatedDocument": "Commtiee_Monthly_Progress_Update", "remarks": "Owner assumed (data points feed the analysis); please confirm." } },
    { values: { "ref": "T04", "workstream": "Records & Data Collection", "task": "Collect data from Student Connect team", "primaryOwner": "Unassigned", "stakeholder": "Student Connect team", "priority": "Medium", "status": "Not Started", "sourceRef": "BN-5", "remarks": "Owner to be assigned." } },
    { values: { "ref": "T05", "workstream": "Records & Data Collection", "task": "Student undertaking (old one, taken at the beginning of the semester; discussed with Dr. Koppa)", "primaryOwner": "External", "stakeholder": "Jayshree; Dr. Koppa", "priority": "Medium", "status": "Not Started", "sourceRef": "BN-6, HW-3", "remarks": "Jayshree is named against this item on the handwritten note; confirm who follows up in the team." } },
    { values: { "ref": "T06", "workstream": "Semester Planning", "task": "Next semester planning (semester checklist)", "primaryOwner": "Hepsi", "priority": "High", "status": "Not Started", "sourceRef": "WB-8, BN-7, HW-4" } },
    { values: { "ref": "T07", "workstream": "Semester Planning", "task": "Finalise program nomenclature and send to Admission Team", "primaryOwner": "Hepsi", "stakeholder": "Dr. Koppa; Admission Team", "priority": "High", "status": "Not Started", "sourceRef": "BN-8, HW-5", "remarks": "Open question on the note: has this been sent to the Admission Team?" } },
    { values: { "ref": "T08", "workstream": "Semester Planning", "task": "Department plan: AY 2026 (semesters 2, 4, 6) and AY 2027 (admission spokes)", "primaryOwner": "Unassigned", "priority": "Medium", "status": "Not Started", "sourceRef": "BN-9, HW-6", "remarks": "Owner to be assigned." } },
    { values: { "ref": "T09", "workstream": "Semester Planning", "task": "Semester calendar of dates (university calendar + department dates)", "primaryOwner": "Unassigned", "priority": "High", "status": "In Progress", "sourceRef": "BN-10, HW-7", "relatedDocument": "BBA Lalbagh Calendar of Events Dashboard 2026-27", "remarks": "Checklist note: dates plugged and verified, ready to release. Owner to be assigned." } },
    { values: { "ref": "T10", "workstream": "Semester Planning", "task": "Time table", "primaryOwner": "Unassigned", "priority": "High", "status": "Not Started", "sourceRef": "WB-6, BN-11", "remarks": "Owner to be assigned (Vijay's timetable automation could be reused)." } },
    { values: { "ref": "T11", "workstream": "Semester Planning", "task": "Course allocation details (MTN & SP)", "primaryOwner": "Unassigned", "priority": "High", "status": "Not Started", "dueDate": "2026-11-20", "sourceRef": "BN-12, HW-8", "remarks": "Due 20 Nov 2026 per checklist. 'MTN & SP' copied as written; confirm expansion." } },
    { values: { "ref": "T12", "workstream": "Semester Planning", "task": "Semester commencement: orientation for semesters 2, 4, 6", "primaryOwner": "Hepsi", "priority": "Medium", "status": "Not Started", "sourceRef": "BN-13, HW-9" } },
    { values: { "ref": "T13", "workstream": "Semester Planning", "task": "Area-wise allotment", "primaryOwner": "Unassigned", "stakeholder": "Area Chairs", "priority": "Medium", "status": "Not Started", "sourceRef": "HW-10", "remarks": "Marked with '?' on the handwritten note; scope to be confirmed." } },
    { values: { "ref": "T14", "workstream": "Semester Planning", "task": "Admission process", "primaryOwner": "Unassigned", "stakeholder": "Admission Team", "priority": "Medium", "status": "Not Started", "sourceRef": "WB-7", "remarks": "Owner to be assigned." } },
    { values: { "ref": "T15", "workstream": "Semester Planning", "task": "Schedule", "primaryOwner": "Hepsi", "priority": "Medium", "status": "Not Started", "sourceRef": "WB-9", "remarks": "Hepsi is written beside Schedule on the whiteboard." } },
    { values: { "ref": "T16", "workstream": "OBE", "task": "OBE (overall coordination)", "primaryOwner": "Hepsi", "priority": "High", "status": "Not Started", "sourceRef": "WB-1, BN-17" } },
    { values: { "ref": "T17", "workstream": "OBE", "task": "OBE: attendance records and reconciliation", "primaryOwner": "Hepsi", "stakeholder": "Area Chairs; Jayshree Ma'am", "priority": "Medium", "status": "Not Started", "sourceRef": "BN-18", "remarks": "Owner inherited from OBE [Hepsi]; confirm." } },
    { values: { "ref": "T18", "workstream": "OBE", "task": "OBE: academic administration", "primaryOwner": "Hepsi", "priority": "Medium", "status": "Not Started", "sourceRef": "BN-19", "remarks": "Owner inherited from OBE [Hepsi]; confirm." } },
    { values: { "ref": "T19", "workstream": "OBE", "task": "OBE: assessment records and reconciliation", "primaryOwner": "Hepsi", "stakeholder": "Dr. Umakant", "priority": "Medium", "status": "Not Started", "sourceRef": "BN-20", "remarks": "Owner inherited from OBE [Hepsi]; confirm." } },
    { values: { "ref": "T20", "workstream": "Analysis & Decision", "task": "Analyse the data (records and monthly review data)", "primaryOwner": "Vijay", "priority": "High", "status": "Not Started", "sourceRef": "WB-5", "remarks": "Whiteboard: Analysis, Vijaya. Previous semester records feed this step." } },
    { values: { "ref": "T21", "workstream": "Analysis & Decision", "task": "Decision recommendations from the analysis", "primaryOwner": "Vijay", "priority": "High", "status": "Not Started", "sourceRef": "WB-5", "remarks": "Analyse the data, then Decision." } },
    { values: { "ref": "T22", "workstream": "Analysis & Decision", "task": "Outcome tracking and reporting", "primaryOwner": "Vijay", "priority": "Medium", "status": "Not Started", "sourceRef": "WB-5", "remarks": "Decision, then Outcome." } },
    { values: { "ref": "T23", "workstream": "Admin & Other", "task": "Acknowledgement letter", "primaryOwner": "Hepsi", "support": "Yamini", "priority": "Medium", "status": "Not Started", "sourceRef": "WB-4", "remarks": "Whiteboard bracket reads [H.Y]; read as Hepsi and Yamini. Confirm." } },
    { values: { "ref": "T24", "workstream": "Admin & Other", "task": "BBA entrepreneurship", "primaryOwner": "Unassigned", "priority": "Medium", "status": "Not Started", "sourceRef": "BN-14, BN-15", "remarks": "Appears twice on the checklist. Owner to be assigned." } },
    { values: { "ref": "T25", "workstream": "Admin & Other", "task": "GSS and attendance circulars", "primaryOwner": "Unassigned", "priority": "Medium", "status": "Not Started", "sourceRef": "BN-15", "remarks": "'GSS' copied as written. Owner to be assigned." } },
    { values: { "ref": "T26", "workstream": "Admin & Other", "task": "Toastmasters", "primaryOwner": "Unassigned", "priority": "Low", "status": "Not Started", "sourceRef": "BN-16", "remarks": "Scheduled 'next week' on the 20 Nov checklist; exact date not given." } },
  ],
  "weekly-review": [
    { values: { "weekEnding": "2026-11-27", "member": "Karshima", "taskRef": "T01", "done": "Compiled activity records for two programmes", "progress": "40", "pending": "Records for remaining programmes", "nextPlan": "Share cleaned records with Vijay for analysis" } },
  ],
  "source-map": [
    { values: { "source": "Whiteboard (20-Nov-2026)", "ref": "WB-1", "text": "Current Work 1) OBE [Hepsi]", "taskRef": "T16" } },
    { values: { "source": "Whiteboard (20-Nov-2026)", "ref": "WB-2", "text": "Current Work 2) Previous semester records [Kar, Yamu]; arrow to Analysis (Vijaya)", "taskRef": "T01", "note": "Arrow shows records feeding Vijay's analysis" } },
    { values: { "source": "Whiteboard (20-Nov-2026)", "ref": "WB-3", "text": "Current Work 3) Committee, Review, Monthly Meeting [Data points]", "taskRef": "T03" } },
    { values: { "source": "Whiteboard (20-Nov-2026)", "ref": "WB-4", "text": "Current Work 4) Acknowledge letter [H.Y]", "taskRef": "T23", "note": "Bracket partly unclear" } },
    { values: { "source": "Whiteboard (20-Nov-2026)", "ref": "WB-5", "text": "Analysis: Vijaya. Analyse the Data → Decision → Outcome", "taskRef": "T20", "alsoMapsTo": "T21, T22" } },
    { values: { "source": "Whiteboard (20-Nov-2026)", "ref": "WB-6", "text": "Future plan 1) Time Table", "taskRef": "T10" } },
    { values: { "source": "Whiteboard (20-Nov-2026)", "ref": "WB-7", "text": "Future plan 2) Admission process", "taskRef": "T14" } },
    { values: { "source": "Whiteboard (20-Nov-2026)", "ref": "WB-8", "text": "Future plan 3) Next Semester", "taskRef": "T06" } },
    { values: { "source": "Whiteboard (20-Nov-2026)", "ref": "WB-9", "text": "Future plan 4) Schedule [Hepsi]", "taskRef": "T15" } },
    { values: { "source": "Whiteboard (20-Nov-2026)", "ref": "WB-10", "text": "Weekly Meeting: What was done? What's the progress? What is pending? What is next plan?", "taskRef": "Weekly Review", "note": "Captured in the Weekly Review sheet" } },
    { values: { "source": "BBA checklist (phone note)", "ref": "BN-1", "text": "BB (group heading for the items below)", "note": "Heading only" } },
    { values: { "source": "BBA checklist (phone note)", "ref": "BN-2", "text": "Record of all activities and plan till now", "taskRef": "T01" } },
    { values: { "source": "BBA checklist (phone note)", "ref": "BN-3", "text": "Data from area chairs - monthly reviews", "taskRef": "T02" } },
    { values: { "source": "BBA checklist (phone note)", "ref": "BN-4", "text": "Data from committee members", "taskRef": "T03" } },
    { values: { "source": "BBA checklist (phone note)", "ref": "BN-5", "text": "Data from student connect team", "taskRef": "T04" } },
    { values: { "source": "BBA checklist (phone note)", "ref": "BN-6", "text": "Student undertaking - Jaishree (old, in the beginning of the semester, discussed with Dr. Koppa)", "taskRef": "T05" } },
    { values: { "source": "BBA checklist (phone note)", "ref": "BN-7", "text": "Next semester - planning (semester checklist)", "taskRef": "T06" } },
    { values: { "source": "BBA checklist (phone note)", "ref": "BN-8", "text": "Finalisation of program nomenclature - has this been sent to Admission Team", "taskRef": "T07", "note": "Open question on the note" } },
    { values: { "source": "BBA checklist (phone note)", "ref": "BN-9", "text": "Department Plan (AY 2027)", "taskRef": "T08" } },
    { values: { "source": "BBA checklist (phone note)", "ref": "BN-10", "text": "Semester calendar of dates (check university calendar, check department dates - plugged - dates verified - ready to release)", "taskRef": "T09" } },
    { values: { "source": "BBA checklist (phone note)", "ref": "BN-11", "text": "Time table", "taskRef": "T10" } },
    { values: { "source": "BBA checklist (phone note)", "ref": "BN-12", "text": "Course allocation - details - 20 NOV 2026", "taskRef": "T11" } },
    { values: { "source": "BBA checklist (phone note)", "ref": "BN-13", "text": "Semester Commencement - Orientation, 2, 4, 6 - Hepsi", "taskRef": "T12" } },
    { values: { "source": "BBA checklist (phone note)", "ref": "BN-14", "text": "BBA entrepreneurship", "taskRef": "T24" } },
    { values: { "source": "BBA checklist (phone note)", "ref": "BN-15", "text": "GSS, Attendance circulars, BBA entrepreneurship", "taskRef": "T25", "alsoMapsTo": "T24" } },
    { values: { "source": "BBA checklist (phone note)", "ref": "BN-16", "text": "Toastmasters - next week", "taskRef": "T26" } },
    { values: { "source": "BBA checklist (phone note)", "ref": "BN-17", "text": "OBE", "taskRef": "T16" } },
    { values: { "source": "BBA checklist (phone note)", "ref": "BN-18", "text": "Attendance records and reconciliation - Area Chairs and Jayshree Ma'am", "taskRef": "T17" } },
    { values: { "source": "BBA checklist (phone note)", "ref": "BN-19", "text": "Academic administration", "taskRef": "T18" } },
    { values: { "source": "BBA checklist (phone note)", "ref": "BN-20", "text": "Assessment records and reconciliation - Dr Umakant", "taskRef": "T19" } },
    { values: { "source": "BBA checklist (phone note)", "ref": "BN-21", "text": "(Checklist continues below the visible screenshot area; remaining items not captured)", "note": "Please share the rest to add them" } },
    { values: { "source": "Handwritten notes (20/11/26)", "ref": "HW-1", "text": "1) Activities that are done in overall BBA till now [Record]", "taskRef": "T01" } },
    { values: { "source": "Handwritten notes (20/11/26)", "ref": "HW-2", "text": "2) Data from area chair [Monthly reports] [Micro credentials, Internship, Mentoring] [Yamu, Karshim]", "taskRef": "T02" } },
    { values: { "source": "Handwritten notes (20/11/26)", "ref": "HW-3", "text": "3) Student undertaking [Jayshree]", "taskRef": "T05" } },
    { values: { "source": "Handwritten notes (20/11/26)", "ref": "HW-4", "text": "4) Next semester planning [Hepsi]", "taskRef": "T06" } },
    { values: { "source": "Handwritten notes (20/11/26)", "ref": "HW-5", "text": "5) Finalize the nomenclature [Hepsi to Koppa sir]", "taskRef": "T07" } },
    { values: { "source": "Handwritten notes (20/11/26)", "ref": "HW-6", "text": "6) Department plan AY-26 & AY-27: AY-26 → 2, 4, 6; AY-27 → Admission spokes", "taskRef": "T08" } },
    { values: { "source": "Handwritten notes (20/11/26)", "ref": "HW-7", "text": "7) Semester calendar of dates [university calendar, departments of dates]", "taskRef": "T09" } },
    { values: { "source": "Handwritten notes (20/11/26)", "ref": "HW-8", "text": "8) MTN & SP [course allocation]", "taskRef": "T11", "note": "'MTN & SP' copied as written" } },
    { values: { "source": "Handwritten notes (20/11/26)", "ref": "HW-9", "text": "9) Semester commence [2, 4, 6] Hepsi", "taskRef": "T12" } },
    { values: { "source": "Handwritten notes (20/11/26)", "ref": "HW-10", "text": "10) Area wise allotment ?", "taskRef": "T13", "note": "Marked with '?'" } },
  ],
  "programme-structure": [
    { values: { "area": "marketing", "programme": "BBA Majirs in" } },
    { values: { "programme": "2", "courses": "10" } },
  ],
}

/** Row counts at import time, asserted by the importer's test. */
export const REGISTER_SEED_COUNTS: Record<string, number> = {"documents": 33, "work-allocation": 26, "weekly-review": 1, "source-map": 41, "programme-structure": 2}
