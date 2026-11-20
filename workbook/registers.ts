import type { Register, RegisterField } from '../apps/web/src/types/registry.js'

/**
 * The registers the Master Index workbook arrived with.
 *
 * Shared between the browser and the server function that imports the
 * workbook, which is why it sits here rather than in apps/web. Unlike
 * seed.ts beside it, this file holds only column definitions — no record
 * content — so nothing here is confidential.
 *
 * These are seed definitions, not a schema. They are copied into the store on
 * first run and are editable from then on: a column added in the application
 * is stored against the register, not here. Changing a label in this file
 * affects a fresh install only, which is the correct behaviour — it must not
 * silently rewrite a register the team has already reorganised.
 */

const ts = '2026-11-20T00:00:00.000Z'

function f(
  id: string,
  label: string,
  kind: RegisterField['kind'],
  extra: Partial<RegisterField> = {},
): RegisterField {
  return { id, label, kind, inGrid: true, builtIn: true, ...extra }
}

export const BUILT_IN_REGISTERS: Register[] = [
  {
    id: 'reg_documents',
    slug: 'documents',
    name: 'Document Master Index',
    description:
      'Every document the team maintains, with its format, Drive location, owner and current status.',
    group: 'Records',
    icon: 'folder',
    titleFieldId: 'name',
    statusFieldId: 'status',
    ownerFieldId: 'owner',
    updatedFieldId: 'lastUpdated',
    doneValues: ['Active', 'Archived'],
    builtIn: true,
    createdAt: ts,
    updatedAt: ts,
    fields: [
      f('serial', 'S.No', 'text', { inGrid: false }),
      f('name', 'Document', 'text'),
      f('sharedBy', 'Source / shared by', 'text'),
      f('format', 'Format', 'select', {
        options: ['Google Sheet', 'Google Doc', 'Pptx', 'Docx', 'Xlsx', 'PDF', 'Folder', 'Other'],
      }),
      f('driveLink', 'Drive link', 'url'),
      f('driveLabel', 'Drive label', 'text', { inGrid: false, help: 'Link text as written in the workbook.' }),
      f('sheetLink', 'Spreadsheet link', 'url', { inGrid: false }),
      f('status', 'Status', 'select', {
        options: ['Active', 'In Progress', 'Unconfirmed', 'Archived'],
      }),
      f('owner', 'Owner', 'text'),
      f('lastUpdated', 'Last updated', 'date'),
      f('remarks', 'Remarks', 'longtext', { inGrid: false }),
    ],
  },
  {
    id: 'reg_work_allocation',
    slug: 'work-allocation',
    name: 'Work Allocation',
    description:
      'Who owns which task, its workstream, priority, due date and the source note it came from.',
    group: 'Work',
    icon: 'clipboard',
    titleFieldId: 'task',
    statusFieldId: 'status',
    ownerFieldId: 'primaryOwner',
    dueFieldId: 'dueDate',
    doneValues: ['Completed', 'Dropped'],
    builtIn: true,
    createdAt: ts,
    updatedAt: ts,
    fields: [
      f('ref', 'ID', 'text'),
      f('workstream', 'Workstream', 'select', {
        options: [
          'Records & Data Collection',
          'Semester Planning',
          'Academic Delivery',
          'Analysis & Reporting',
          'Student & Admissions',
          'Governance & Correspondence',
        ],
      }),
      f('task', 'Task', 'text'),
      f('primaryOwner', 'Primary owner', 'text'),
      f('support', 'Support', 'text'),
      f('stakeholder', 'Stakeholder / contact', 'text', { inGrid: false }),
      f('priority', 'Priority', 'select', { options: ['Low', 'Medium', 'High'] }),
      f('status', 'Status', 'select', {
        options: ['Not Started', 'In Progress', 'Pending', 'Completed', 'Dropped'],
      }),
      f('dueDate', 'Due date', 'date'),
      f('sourceRef', 'Source ref', 'text', { inGrid: false }),
      f('relatedDocument', 'Related document', 'text', { inGrid: false }),
      f('remarks', 'Remarks', 'longtext', { inGrid: false }),
    ],
  },
  {
    id: 'reg_weekly_review',
    slug: 'weekly-review',
    name: 'Weekly Review',
    description:
      'The four weekly questions per member: what was done, progress, what is pending, what is next.',
    group: 'Work',
    icon: 'calendar',
    titleFieldId: 'member',
    dueFieldId: 'weekEnding',
    builtIn: true,
    createdAt: ts,
    updatedAt: ts,
    fields: [
      f('weekEnding', 'Week ending', 'date'),
      f('member', 'Member', 'text'),
      f('taskRef', 'Task ID', 'text'),
      f('done', 'What was done', 'longtext'),
      f('progress', 'Progress', 'percent'),
      f('pending', 'What is pending', 'longtext'),
      f('nextPlan', 'Next plan', 'longtext', { inGrid: false }),
    ],
  },
  {
    id: 'reg_source_map',
    slug: 'source-map',
    name: 'Source Map',
    description:
      'Every line from the whiteboard, checklist and handwritten notes, mapped to the task it became.',
    group: 'Governance',
    icon: 'map',
    titleFieldId: 'text',
    builtIn: true,
    createdAt: ts,
    updatedAt: ts,
    fields: [
      f('source', 'Source', 'text'),
      f('ref', 'Ref', 'text'),
      f('text', 'Text as noted', 'longtext'),
      f('taskRef', 'Task ID', 'text'),
      f('alsoMapsTo', 'Also maps to', 'text', { inGrid: false }),
      f('note', 'Note', 'longtext', { inGrid: false }),
    ],
  },
  {
    id: 'reg_programme_structure',
    slug: 'programme-structure',
    name: 'Programme Structure',
    description:
      'Area, programme, courses, faculty, TLEPs and student counts. Started in the workbook and left incomplete.',
    group: 'Academics',
    icon: 'graduation',
    titleFieldId: 'programme',
    ownerFieldId: 'area',
    builtIn: true,
    createdAt: ts,
    updatedAt: ts,
    fields: [
      f('area', 'Area', 'text'),
      f('programme', 'Programme', 'text'),
      f('courses', 'Courses / subjects', 'number'),
      f('faculty', 'Faculty', 'number'),
      f('tleps', 'TLEPs', 'number'),
      f('students', 'Students', 'number'),
    ],
  },
]

/** Fields whose emptiness makes a record incomplete, by register slug. */
export const COMPLETENESS_FIELDS: Record<string, string[]> = {
  documents: ['owner', 'status', 'format'],
  'work-allocation': ['primaryOwner', 'dueDate'],
  'weekly-review': ['done', 'progress'],
  'source-map': ['taskRef'],
  'programme-structure': ['courses', 'faculty', 'students'],
}
