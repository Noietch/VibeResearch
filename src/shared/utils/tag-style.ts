/**
 * Tag styling utilities
 * Provides consistent tag colors based on tag category.
 */

import type { TagCategory } from '../types/domain';

export interface TagStyle {
  bg: string;
  text: string;
}

const CATEGORY_TAG_STYLES: Record<TagCategory, TagStyle> = {
  domain: { bg: 'bg-blue-50', text: 'text-blue-700' },
  method: { bg: 'bg-purple-50', text: 'text-purple-700' },
  topic: { bg: 'bg-green-50', text: 'text-green-700' },
};

/**
 * Get tag styling based on its category.
 * - domain → blue
 * - method → purple
 * - topic → green
 */
export function getTagStyle(category: TagCategory | string): TagStyle {
  if (category in CATEGORY_TAG_STYLES) {
    return CATEGORY_TAG_STYLES[category as TagCategory];
  }
  // Default to topic (green) for unknown categories
  return CATEGORY_TAG_STYLES.topic;
}
