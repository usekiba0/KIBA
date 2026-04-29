import { User } from '../../data/entities/user.entity';

export function buildNutritionPrompt(user: User): string {
  const conditions = user.health_conditions?.length
    ? `\nUser health conditions to flag: ${user.health_conditions.join(', ')}`
    : '';
  const restrictions = user.dietary_restrictions?.length
    ? `\nDietary restrictions: ${user.dietary_restrictions.join(', ')}`
    : '';

  return `Analyse this food photo and return ONLY valid JSON:
{
  "food_identified": boolean,
  "detected_foods": ["item1", "item2"],
  "total_calories": number or null,
  "macronutrients": {
    "protein_grams": number or null,
    "carbs_grams": number or null,
    "fat_grams": number or null
  },
  "health_condition_flags": ["flag1"],
  "dietary_recommendation": "one specific recommendation under 120 chars"
}

If no food is visible, return food_identified: false and null for all numbers.
Calorie estimates are approximate — that is fine and expected.${conditions}${restrictions}`;
}
