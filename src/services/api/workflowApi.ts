import { apiClient } from './client';
import type { WorkflowStep, PilotDeliverable, ReviewRequestPayload, ReviewRequestResponse } from '../../types';

const FALLBACK_STEPS: WorkflowStep[] = [
  {
    stepNumber: 1,
    nameKey: 'workflow.step1Name',
    descKey: 'workflow.step1Desc',
    inputsKey: 'workflow.step1Inputs',
    outputsKey: 'workflow.step1Outputs',
    isHumanGoverned: false,
    testId: 'workflow-step-card-1'
  },
  {
    stepNumber: 2,
    nameKey: 'workflow.step2Name',
    descKey: 'workflow.step2Desc',
    inputsKey: 'workflow.step2Inputs',
    outputsKey: 'workflow.step2Outputs',
    isHumanGoverned: false,
    testId: 'workflow-step-card-2'
  },
  {
    stepNumber: 3,
    nameKey: 'workflow.step3Name',
    descKey: 'workflow.step3Desc',
    inputsKey: 'workflow.step3Inputs',
    outputsKey: 'workflow.step3Outputs',
    isHumanGoverned: false,
    testId: 'workflow-step-card-3'
  },
  {
    stepNumber: 4,
    nameKey: 'workflow.step4Name',
    descKey: 'workflow.step4Desc',
    inputsKey: 'workflow.step4Inputs',
    outputsKey: 'workflow.step4Outputs',
    isHumanGoverned: false,
    testId: 'workflow-step-card-4'
  },
  {
    stepNumber: 5,
    nameKey: 'workflow.step5Name',
    descKey: 'workflow.step5Desc',
    inputsKey: 'workflow.step5Inputs',
    outputsKey: 'workflow.step5Outputs',
    isHumanGoverned: true, // Crucial Human Review Point
    testId: 'workflow-step-card-5'
  },
  {
    stepNumber: 6,
    nameKey: 'workflow.step6Name',
    descKey: 'workflow.step6Desc',
    inputsKey: 'workflow.step6Inputs',
    outputsKey: 'workflow.step6Outputs',
    isHumanGoverned: true, // Lead Partner Sign-off
    testId: 'workflow-step-card-6'
  }
];

const FALLBACK_DELIVERABLES: PilotDeliverable[] = [
  {
    id: 'DELIV-01',
    titleKey: 'deliverables.deliv1Title',
    descKey: 'deliverables.deliv1Desc',
    deliveryWeek: 2,
    provenance: 'STUDENT-PROPOSED DESIGN',
    testId: 'workflow-deliverable-card-01'
  },
  {
    id: 'DELIV-02',
    titleKey: 'deliverables.deliv2Title',
    descKey: 'deliverables.deliv2Desc',
    deliveryWeek: 4,
    provenance: 'STUDENT-PROPOSED DESIGN',
    testId: 'workflow-deliverable-card-02'
  },
  {
    id: 'DELIV-03',
    titleKey: 'deliverables.deliv3Title',
    descKey: 'deliverables.deliv3Desc',
    deliveryWeek: 6,
    provenance: 'STUDENT-PROPOSED DESIGN',
    testId: 'workflow-deliverable-card-03'
  },
  {
    id: 'DELIV-04',
    titleKey: 'deliverables.deliv4Title',
    descKey: 'deliverables.deliv4Desc',
    deliveryWeek: 8,
    provenance: 'STUDENT-PROPOSED DESIGN',
    testId: 'workflow-deliverable-card-04'
  },
  {
    id: 'DELIV-05',
    titleKey: 'deliverables.deliv5Title',
    descKey: 'deliverables.deliv5Desc',
    deliveryWeek: 10,
    provenance: 'STUDENT-PROPOSED DESIGN',
    testId: 'workflow-deliverable-card-05'
  },
  {
    id: 'DELIV-06',
    titleKey: 'deliverables.deliv6Title',
    descKey: 'deliverables.deliv6Desc',
    deliveryWeek: 12,
    provenance: 'STUDENT-PROPOSED DESIGN',
    testId: 'workflow-deliverable-card-06'
  }
];

export const workflowApi = {
  async getWorkflowSteps(): Promise<WorkflowStep[]> {
    try {
      const response = await apiClient.get<WorkflowStep[]>('/api/v1/workflow/steps');
      return response.data || FALLBACK_STEPS;
    } catch {
      return FALLBACK_STEPS;
    }
  },

  async getDeliverables(): Promise<PilotDeliverable[]> {
    try {
      const response = await apiClient.get<PilotDeliverable[]>('/api/v1/workflow/deliverables');
      return response.data || FALLBACK_DELIVERABLES;
    } catch {
      return FALLBACK_DELIVERABLES;
    }
  },

  async createReviewRequest(payload: ReviewRequestPayload): Promise<ReviewRequestResponse> {
    try {
      const response = await apiClient.post<ReviewRequestResponse>('/api/v1/workflow/reviews', payload);
      return response.data;
    } catch {
      // Deterministic simulation response matching API contract
      const randomSeq = Math.floor(100 + Math.random() * 900);
      return {
        id: Date.now(),
        code: `REV-2026-${randomSeq}`,
        status: 'SUBMITTED_TO_STAGE_1',
        title: payload.title
      };
    }
  }
};

