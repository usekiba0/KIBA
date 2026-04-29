'use client';
import AutocompleteTagInput from './AutocompleteTagInput';

interface Props {
  data: { health_conditions: string[]; dietary_restrictions: string[]; injuries?: string };
  onChange: (data: Partial<Props['data']>) => void;
  onNext: () => void;
  onBack: () => void;
}

const HEALTH_CONDITIONS = [
  // Cardiovascular
  'Hypertension (high blood pressure)', 'Heart disease', 'High cholesterol', 'Coronary artery disease',
  'Heart failure', 'Atrial fibrillation', 'Peripheral artery disease',
  // Metabolic
  'Type 1 diabetes', 'Type 2 diabetes', 'Pre-diabetes', 'Hypothyroidism', 'Hyperthyroidism',
  'PCOS', 'Metabolic syndrome', 'Obesity',
  // Musculoskeletal
  'Osteoarthritis', 'Rheumatoid arthritis', 'Fibromyalgia', 'Osteoporosis', 'Scoliosis',
  'Gout', 'Ankylosing spondylitis', 'Lupus',
  // Respiratory
  'Asthma', 'COPD', 'Sleep apnea', 'Chronic bronchitis',
  // Neurological
  'Epilepsy', 'Multiple sclerosis', 'Migraines', 'Parkinson\'s disease', 'Peripheral neuropathy',
  // Mental health
  'Anxiety disorder', 'Depression', 'ADHD', 'PTSD', 'Bipolar disorder', 'OCD',
  // Digestive
  'IBS (irritable bowel syndrome)', 'Crohn\'s disease', 'Celiac disease', 'GERD / acid reflux',
  'Ulcerative colitis',
  // Other
  'Chronic kidney disease', 'Anemia', 'Cancer (in remission)', 'HIV (controlled)', 'Liver disease',
];

const DIETARY_RESTRICTIONS = [
  // Lifestyle
  'Vegan', 'Vegetarian', 'Pescatarian', 'Flexitarian',
  // Common allergens
  'Gluten-free', 'Dairy-free', 'Lactose intolerant', 'Nut allergy', 'Tree nut allergy',
  'Peanut allergy', 'Egg-free', 'Soy-free', 'Shellfish-free', 'Fish allergy', 'Sesame-free',
  // Religious / cultural
  'Halal', 'Kosher', 'No pork', 'No beef',
  // Diet styles
  'Keto', 'Paleo', 'Low-carb', 'Low-fat', 'Low-sodium', 'Low-sugar',
  'Mediterranean', 'Whole30', 'Intermittent fasting',
  // Other
  'No alcohol', 'Fructose intolerant', 'Low-FODMAP', 'No red meat', 'No processed foods',
];

const INJURIES = [
  // Back
  'Lower back pain', 'Upper back pain', 'Herniated disc', 'Sciatica', 'Spinal stenosis',
  'Degenerative disc disease',
  // Knees
  'Left knee pain', 'Right knee pain', 'ACL tear / surgery', 'Meniscus injury',
  'Patellar tendinitis', 'Knee replacement',
  // Hips
  'Hip pain', 'Hip replacement', 'Hip flexor strain', 'IT band syndrome',
  // Shoulders
  'Left shoulder injury', 'Right shoulder injury', 'Rotator cuff injury',
  'Shoulder impingement', 'Frozen shoulder',
  // Feet & ankles
  'Plantar fasciitis', 'Achilles tendinitis', 'Ankle sprain', 'Flat feet',
  // Neck
  'Neck pain', 'Cervical stenosis', 'Whiplash',
  // Arms
  'Tennis elbow', 'Golfer\'s elbow', 'Carpal tunnel syndrome', 'Wrist injury',
  // Other
  'Hernia', 'Post-surgery recovery', 'Chronic pain', 'Joint hypermobility',
  'Limited range of motion',
];

export default function Step3HealthInfo({ data, onChange, onNext, onBack }: Props) {
  // Injuries stored as comma-joined string in form state; manage as array for UI
  const injuryTags = data.injuries
    ? data.injuries.split(', ').filter(Boolean)
    : [];

  const handleInjuriesChange = (tags: string[]) => {
    onChange({ injuries: tags.length > 0 ? tags.join(', ') : undefined });
  };

  return (
    <div className="step">
      <h2>Health &amp; lifestyle</h2>
      <p className="step-desc">
        Your coach uses this to keep your plan safe and personalised. All fields are optional.
      </p>

      <div className="health-section">
        <div className="health-section-header">
          <span className="health-section-icon">🩺</span>
          <span className="health-section-label">Health conditions</span>
        </div>
        <p className="health-section-hint">
          Search the list or type to add a custom condition.
        </p>
        <AutocompleteTagInput
          tags={data.health_conditions}
          onTagsChange={tags => onChange({ health_conditions: tags })}
          suggestions={HEALTH_CONDITIONS}
          placeholder="e.g. Type 2 diabetes, Asthma…"
        />
      </div>

      <div className="health-section">
        <div className="health-section-header">
          <span className="health-section-icon">🥗</span>
          <span className="health-section-label">Dietary restrictions</span>
        </div>
        <p className="health-section-hint">
          Allergies, lifestyle choices, or religious requirements.
        </p>
        <AutocompleteTagInput
          tags={data.dietary_restrictions}
          onTagsChange={tags => onChange({ dietary_restrictions: tags })}
          suggestions={DIETARY_RESTRICTIONS}
          placeholder="e.g. Vegan, Gluten-free…"
        />
      </div>

      <div className="health-section">
        <div className="health-section-header">
          <span className="health-section-icon">🦴</span>
          <span className="health-section-label">Injuries &amp; physical limitations</span>
        </div>
        <p className="health-section-hint">
          Your coach will avoid exercises that could aggravate these.
        </p>
        <AutocompleteTagInput
          tags={injuryTags}
          onTagsChange={handleInjuriesChange}
          suggestions={INJURIES}
          placeholder="e.g. Lower back pain, Left knee…"
        />
      </div>

      <div className="btn-row">
        <button className="btn-secondary" onClick={onBack} type="button">← Back</button>
        <button className="btn-primary" onClick={onNext} type="button">Continue →</button>
      </div>
    </div>
  );
}
