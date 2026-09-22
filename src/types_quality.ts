/**
 * Quality Assurance and Etqan Standards Types
 * Phase 5: Quality Module
 */

export type QualityApplicableTo = 'DAILY_REPORT' | 'TEACHER_VISIT' | 'COMPREHENSIVE_EVALUATION';

export interface QualityStandard {
  id: string;
  schoolId: string;
  code: string;
  domain: string;
  standard: string;
  indicator: string;
  description: string;
  weight: number; // e.g., 1 to 100
  evaluationScale: number; // e.g., 4 (1-4) or 5 (1-5) or 100
  evidenceRequired: boolean;
  applicableTo: QualityApplicableTo[];
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type CorrectiveActionStatus = 'Open' | 'In Progress' | 'Closed' | 'Overdue';

export interface CorrectiveAction {
  id: string;
  schoolId: string;
  sourceType: 'DAILY_REPORT' | 'TEACHER_VISIT' | 'COMPREHENSIVE_EVALUATION' | 'GENERAL';
  sourceId: string;
  standardId?: string;
  standardCode?: string;
  description: string;
  ownerEmployeeId: string;
  ownerName?: string;
  dueDate: string; // YYYY-MM-DD
  status: CorrectiveActionStatus;
  closedAt?: string;
  closureEvidence?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IndicatorEvaluation {
  standardId: string;
  indicatorCode?: string;
  indicatorText?: string;
  score: number; // Raw score on the standard's evaluationScale
  weight?: number;
  evidence?: string;
  comment?: string;
}

export type QualityReportStatus = 'Draft' | 'Submitted' | 'Approved' | 'RequiresRevision';

export interface DailyQualityReport {
  id: string;
  schoolId: string;
  date: string; // YYYY-MM-DD
  evaluatorId: string;
  evaluatorName: string;
  evaluatorRole?: string;
  domain?: string;
  evaluations: IndicatorEvaluation[];
  observations?: string;
  strengths: string[];
  improvementAreas: string[];
  correctiveActionsSummary?: string;
  correctiveActionOwnerId?: string;
  correctiveActionDueDate?: string;
  correctiveActionCreatedId?: string;
  evidenceNotes?: string;
  status: QualityReportStatus;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeacherVisitReport {
  id: string;
  schoolId: string;
  teacherId: string;
  teacherName?: string;
  date: string; // YYYY-MM-DD
  classroom: string;
  subject: string;
  period: number;
  evaluatorId: string;
  evaluatorName: string;
  evaluations: IndicatorEvaluation[];
  strengths: string[];
  improvementAreas: string[];
  correctiveActionNotes?: string;
  followUpDate?: string;
  overallScore?: number; // Calculated weighted percentage
  status: QualityReportStatus;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComprehensiveEvaluation {
  id: string;
  schoolId: string;
  title: string;
  targetType: 'SCHOOL' | 'DEPARTMENT' | 'TEACHER' | 'GENERAL';
  targetId?: string;
  targetName?: string;
  periodLabel: string; // e.g. "الفصل الدراسي الأول 2026/2027"
  startDate: string;
  endDate: string;
  evaluatorId: string;
  evaluatorName: string;
  evaluations: IndicatorEvaluation[];
  rawScoreTotal: number;
  weightedScore: number; // 0 - 100% computed strictly using standard weights & scales
  strengths: string[];
  improvementAreas: string[];
  status: QualityReportStatus;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}
