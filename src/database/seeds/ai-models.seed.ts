import { DataSource, QueryRunner } from 'typeorm';
import { AiModel, AiModelStatus } from '../entities/ai-model.entity';

export interface PlannedModelSeedDefinition {
  modelKey: string;
  displayName: string;
  taskFamily: string;
  taskType: string;
  description: string;
  provider: string;
  status: AiModelStatus;
}

/**
 * Initial planned AI models supporting Baseer assistive mobile application capabilities.
 * Following project requirements:
 * 1. Speech-to-Text (STT)
 * 2. Text-to-Speech (TTS)
 * 3. OCR and Document Reading
 * 4. Object Detection
 * 5. Scene Description
 * 6. Obstacle Detection
 * 7. Traffic Sign Recognition
 * 8. Color Detection
 * 9. Currency Recognition
 * 10. Visual Question Answering (VQA)
 * 11. Facial Expression Recognition
 *
 * All records start in 'planned' status without fabricated versions or hashes.
 */
export const BASEER_PLANNED_MODELS: PlannedModelSeedDefinition[] = [
  {
    modelKey: 'stt-speech-to-text',
    displayName: 'Speech-to-Text (Egyptian Arabic & English)',
    taskFamily: 'speech_recognition',
    taskType: 'speech_recognition',
    description:
      'Acoustic and language model for automatic speech recognition, tuned for Egyptian dialect and Modern Standard Arabic voice commands.',
    provider: 'planned',
    status: AiModelStatus.PLANNED,
  },
  {
    modelKey: 'tts-text-to-speech',
    displayName: 'Text-to-Speech (Arabic Synthesis)',
    taskFamily: 'speech_synthesis',
    taskType: 'speech_synthesis',
    description:
      'Neural text-to-speech synthesis generating natural Arabic audio announcements and voice guidance for visually impaired users.',
    provider: 'planned',
    status: AiModelStatus.PLANNED,
  },
  {
    modelKey: 'ocr-document-reading',
    displayName: 'OCR & Document Reading',
    taskFamily: 'document_ocr',
    taskType: 'document_ocr',
    description:
      'Optical character recognition engine for extracting, analyzing, and simplifying Arabic and English text from prescriptions, signs, and documents.',
    provider: 'planned',
    status: AiModelStatus.PLANNED,
  },
  {
    modelKey: 'vision-object-detection',
    displayName: 'Everyday Object Detection',
    taskFamily: 'object_detection',
    taskType: 'object_detection',
    description:
      'Real-time multi-class object detection identifying everyday household, office, and street objects with bounding boxes and spatial cues.',
    provider: 'planned',
    status: AiModelStatus.PLANNED,
  },
  {
    modelKey: 'vision-scene-description',
    displayName: 'Surrounding Scene Description',
    taskFamily: 'scene_description',
    taskType: 'scene_description',
    description:
      'Contextual scene-level visual captioning model providing rich descriptive narration of the environment in Arabic.',
    provider: 'planned',
    status: AiModelStatus.PLANNED,
  },
  {
    modelKey: 'vision-obstacle-detection',
    displayName: 'Obstacle & Danger Detection',
    taskFamily: 'obstacle_detection',
    taskType: 'obstacle_detection',
    description:
      'Real-time safety hazard detection identifying drop-offs, stairs, holes, curbs, and head-height obstacles with distance estimation.',
    provider: 'planned',
    status: AiModelStatus.PLANNED,
  },
  {
    modelKey: 'vision-traffic-signs',
    displayName: 'Traffic Sign Recognition',
    taskFamily: 'traffic_sign_recognition',
    taskType: 'traffic_sign_recognition',
    description:
      'Detection and classification of pedestrian crossing indicators, traffic signals, and street advisory signs.',
    provider: 'planned',
    status: AiModelStatus.PLANNED,
  },
  {
    modelKey: 'vision-color-detection',
    displayName: 'Dominant Color Detection',
    taskFamily: 'color_detection',
    taskType: 'color_detection',
    description:
      'Targeted region color segmentation identifying primary and secondary colors of clothing, objects, and surfaces in Arabic.',
    provider: 'planned',
    status: AiModelStatus.PLANNED,
  },
  {
    modelKey: 'vision-currency-recognition',
    displayName: 'Egyptian Currency Recognition',
    taskFamily: 'currency_recognition',
    taskType: 'currency_recognition',
    description:
      'Banknote classification model recognizing Egyptian Pound denominations (paper and polymer series: 5, 10, 20, 50, 100, 200 EGP).',
    provider: 'planned',
    status: AiModelStatus.PLANNED,
  },
  {
    modelKey: 'vision-vqa',
    displayName: 'Visual Question Answering',
    taskFamily: 'visual_qa',
    taskType: 'visual_qa',
    description:
      'Multimodal question answering allowing visually impaired users to ask targeted natural language questions about what is in front of them.',
    provider: 'planned',
    status: AiModelStatus.PLANNED,
  },
  {
    modelKey: 'vision-face-expression',
    displayName: 'Facial Expression Recognition',
    taskFamily: 'facial_expression',
    taskType: 'facial_expression',
    description:
      'Human face detection and emotion recognition identifying facial expressions (smiling, neutral, surprised, sad) for social awareness.',
    provider: 'planned',
    status: AiModelStatus.PLANNED,
  },
];

/**
 * Idempotently seeds the planned AI models into PostgreSQL.
 * If a model already exists (matched on model_key), updates its attributes.
 * Can be executed repeatedly with zero duplicate side effects.
 */
export async function seedAiModels(
  runnerOrDataSource: QueryRunner | DataSource,
): Promise<{ seeded: number; updated: number }> {
  let seeded = 0;
  let updated = 0;

  for (const model of BASEER_PLANNED_MODELS) {
    if ('getRepository' in runnerOrDataSource) {
      const repo = runnerOrDataSource.getRepository(AiModel);
      const existing = await repo.findOne({ where: { modelKey: model.modelKey } });
      if (existing) {
        // Preserve manually configured custom provider and status (do not overwrite active deployments)
        const preservedProvider =
          existing.provider && existing.provider !== 'planned'
            ? existing.provider
            : model.provider;
        const preservedStatus =
          existing.status && existing.status !== 'planned'
            ? existing.status
            : model.status;

        Object.assign(existing, {
          ...model,
          provider: preservedProvider,
          status: preservedStatus,
          updatedAt: new Date(),
        });
        await repo.save(existing);
        updated++;
      } else {
        const entity = repo.create(model);
        await repo.save(entity);
        seeded++;
      }
    } else {
      const result = await runnerOrDataSource.query(
        `
        INSERT INTO ai_models (
          model_key,
          display_name,
          task_family,
          task_type,
          description,
          provider,
          status,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())
        ON CONFLICT (model_key) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          task_family = EXCLUDED.task_family,
          task_type = EXCLUDED.task_type,
          description = EXCLUDED.description,
          provider = CASE 
            WHEN ai_models.provider IS NOT NULL AND ai_models.provider <> 'planned' 
            THEN ai_models.provider 
            ELSE EXCLUDED.provider 
          END,
          status = CASE 
            WHEN ai_models.status IS NOT NULL AND ai_models.status <> 'planned' 
            THEN ai_models.status 
            ELSE EXCLUDED.status 
          END,
          updated_at = now()
        RETURNING (xmax = 0) AS inserted;
        `,
        [
          model.modelKey,
          model.displayName,
          model.taskFamily,
          model.taskType,
          model.description,
          model.provider,
          model.status,
        ],
      );

      if (result && result[0]) {
        if (result[0].inserted) {
          seeded++;
        } else {
          updated++;
        }
      }
    }
  }

  return { seeded, updated };
}
