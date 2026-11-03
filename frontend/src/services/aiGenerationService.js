import { taskService } from './api';
import { IMAGE_MODELS, VIDEO_MODELS } from '../config/constants';
import { createGenerationSubmitter } from './generationSubmission.js';

export const aiGenerationService = createGenerationSubmitter({
    taskService,
    imageModels: IMAGE_MODELS,
    videoModels: VIDEO_MODELS,
});
