import {
  PROGRESSIVE_OFFERINGS,
  type UserTier,
} from '../config/tiers';

export interface ModelMetadata {
  id: string;
  name: string;
  displayName: string;
  variant: 'standard' | 'power-save' | 'high-quality';
  powerLevel: 'low' | 'medium' | 'high' | 'ultra';
  recommendedFor: string[];
  minVRAM_GB: number;
  defaultQuantization: 'int8' | 'fp16';
  version: string;
  source: 'local' | 'online' | 'community';
  weightFile: string;
  url?: string;
}

export class ModelRegistry {
  private static models: ModelMetadata[] = [
    {
  id: 'rgt-webphoto',
  name: 'rgt-webphoto',
  displayName: 'Real Web Photo RGT',
  variant: 'standard',
  powerLevel: 'high',
  recommendedFor: ['demo', 'web'],
  minVRAM_GB: 6,
  defaultQuantization: 'fp16',
  version: '1.0',
  source: 'local',
  weightFile: 'RealWebPhoto_RGT.pth',
},
{
  id: 'atd-webphoto',
  name: 'atd-webphoto',
  displayName: 'Real Web Photo ATD',
  variant: 'high-quality',
  powerLevel: 'high',
  recommendedFor: ['free', 'web', 'premium'],
  minVRAM_GB: 8,
  defaultQuantization: 'fp16',
  version: '1.0',
  source: 'local',
  weightFile: 'RealWebPhoto_ATD.pth',
},
{
  id: 'rgt-s',
  name: 'rgt-s',
  displayName: 'RGT-S x4',
  variant: 'high-quality',
  powerLevel: 'high',
  recommendedFor: ['desktop'],
  minVRAM_GB: 8,
  defaultQuantization: 'fp16',
  version: '1.0',
  source: 'local',
  weightFile: 'RGT_S_x4.pth',
},
{
  id: 'atd-srx4',
  name: 'atd-srx4',
  displayName: 'ATD SRx4 Finetune',
  variant: 'high-quality',
  powerLevel: 'ultra',
  recommendedFor: ['desktop'],
  minVRAM_GB: 10,
  defaultQuantization: 'fp16',
  version: '1.0',
  source: 'local',
  weightFile: '003_ATD_SRx4_finetune.pth',
},
  ];

  static getAllModels() {
    return this.models;
  }

  static getModelsForTier(tier: string, _platform: string = 'web') {
    const offerings =
      PROGRESSIVE_OFFERINGS[tier as UserTier] || PROGRESSIVE_OFFERINGS.demo;
    return this.models.filter((m) =>
      (offerings.models as readonly string[]).includes(m.name)
    );
  }

  static getRecommendedModel(tier: string, platform: string = 'web') {
    const models = this.getModelsForTier(tier, platform);
    return models[0]?.id || 'rgt-s';
  }

  static getModelById(id: string) {
    return this.models.find((m) => m.id === id);
  }

  static addModel(model: ModelMetadata) {
    this.models.push(model);
  }
}