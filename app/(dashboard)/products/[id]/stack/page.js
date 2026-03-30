import { getProduct, getStackCompleteness } from '../../../actions';
import Link from 'next/link';
import StackEditor from './editor';

export const dynamic = 'force-dynamic';

// Section metadata — labels and field definitions matching stack.js
const SECTIONS = [
  { id: 'construction', label: 'Construction', weight: 25, fields: [
    { key: 'construction_method', label: 'Construction Method', required: true, type: 'select',
      options: ['half-canvas', 'full-canvas', 'fused', 'unstructured'] },
    { key: 'fabric_type',        label: 'Fabric Type',        required: true, type: 'text' },
    { key: 'fabric_weight',      label: 'Fabric Weight',      required: true, type: 'text', placeholder: '260gsm' },
    { key: 'fabric_composition', label: 'Fabric Composition', required: true, type: 'text', placeholder: '100% Super 130\'s Merino' },
    { key: 'fabric_mill',        label: 'Fabric Mill',        required: false, type: 'text' },
    { key: 'lining_type',        label: 'Lining',             required: false, type: 'text' },
    { key: 'interlining',        label: 'Interlining',        required: false, type: 'text' },
    { key: 'button_style',       label: 'Button Style',       required: true, type: 'text', placeholder: 'Real horn, 4-hole, 20L' },
    { key: 'shoulder_type',      label: 'Shoulder Type',      required: false, type: 'select',
      options: ['natural', 'padded', 'soft', 'roped'] },
    { key: 'pocket_style',       label: 'Pocket Style',       required: false, type: 'text' },
  ]},
  { id: 'fit_sizing', label: 'Fit & Sizing', weight: 20, fields: [
    { key: 'fit_model',    label: 'Fit Model', required: true, type: 'select',
      options: ['Lorenzo 6 Drop', 'Lorenzo 4 Drop', 'Alexander 4 Drop', 'Alexander 2 Drop', 'Slim', 'Regular', 'Relaxed', 'Contemporary (Slim)', 'Modern (Extra Slim)', 'Classic'] },
    { key: 'size_range',   label: 'Size Range', required: true, type: 'text', placeholder: '36–52 suits, 14–20 shirts' },
    { key: 'size_chart',   label: 'Size Chart', required: true, type: 'textarea', placeholder: 'JSON or text chart' },
    { key: 'length_options', label: 'Length Options', required: false, type: 'text', placeholder: 'Short, Regular, Long' },
    { key: 'fit_notes',    label: 'Fit Notes',  required: false, type: 'textarea' },
  ]},
  { id: 'colorways', label: 'Colorways', weight: 5, fields: [
    { key: 'colorways', label: 'Colorways', required: true, type: 'textarea', placeholder: 'Navy, Black, Charcoal…' },
  ]},
  { id: 'packaging', label: 'Packaging', weight: 15, fields: [
    { key: 'garment_bag',   label: 'Garment Bag',   required: true,  type: 'select', options: ['yes', 'no'] },
    { key: 'hanger_type',   label: 'Hanger Type',   required: true,  type: 'text' },
    { key: 'tag_placement', label: 'Tag Placement', required: true,  type: 'text' },
    { key: 'barcode_format', label: 'Barcode Format', required: true, type: 'select', options: ['EAN-13', 'UPC-A', 'Code-128'] },
    { key: 'sku_pattern',   label: 'SKU Pattern',   required: true,  type: 'text', placeholder: 'e.g. 27C3[FIT][LEN][SIZE]' },
    { key: 'polybag',       label: 'Poly Bag',      required: false, type: 'select', options: ['yes', 'no'] },
  ]},
  { id: 'care_compliance', label: 'Care & Compliance', weight: 10, fields: [
    { key: 'country_of_origin',   label: 'Country of Origin', required: true, type: 'text', placeholder: 'China' },
    { key: 'care_instructions',   label: 'Care Instructions', required: true, type: 'textarea' },
    { key: 'fiber_content_label', label: 'Fiber Content Label', required: true, type: 'text' },
    { key: 'flammability',        label: 'Flammability',      required: false, type: 'text' },
  ]},
  { id: 'pricing', label: 'Pricing', weight: 10, fields: [
    { key: 'fob',           label: 'FOB ($)',        required: true,  type: 'number' },
    { key: 'duty',          label: 'Duty (%)',       required: true,  type: 'number', placeholder: '24' },
    { key: 'hts',           label: 'HTS Code',      required: true,  type: 'text' },
    { key: 'retail',        label: 'Retail ($)',     required: true,  type: 'number' },
    { key: 'target_margin', label: 'Target Margin %', required: false, type: 'number', placeholder: '55' },
  ]},
  { id: 'vendor', label: 'Vendor', weight: 10, fields: [
    { key: 'vendor_id',     label: 'Vendor ID',      required: true,  type: 'text' },
    { key: 'lead_days',     label: 'Lead Days',      required: true,  type: 'number', placeholder: '90' },
    { key: 'moq',           label: 'MOQ',            required: true,  type: 'number' },
    { key: 'payment_terms', label: 'Payment Terms',  required: true,  type: 'select',
      options: ['standard', '50_50', 'net30', 'full'] },
    { key: 'aql_level',     label: 'AQL Level',      required: false, type: 'select', options: ['1.5', '2.5', '4.0'] },
  ]},
  { id: 'tech_pack', label: 'Tech Pack', weight: 5, fields: [
    { key: 'tech_pack_url',     label: 'Tech Pack URL',     required: false, type: 'text' },
    { key: 'tech_pack_version', label: 'Version',           required: false, type: 'text', placeholder: 'v3.2' },
    { key: 'stitch_types',      label: 'Stitch Types',      required: false, type: 'text' },
  ]},
  { id: 'photography', label: 'Photography', weight: 0, fields: [
    { key: 'hero_shot_angle',  label: 'Hero Shot Angle', required: false, type: 'text', placeholder: 'Front 3/4' },
    { key: 'model_size',       label: 'Model Size',      required: false, type: 'text' },
    { key: 'photography_notes', label: 'Notes',          required: false, type: 'textarea' },
  ]},
  { id: 'bom', label: 'Bill of Materials', weight: 0, fields: [
    { key: 'bom_notes', label: 'BOM Notes', required: false, type: 'textarea', placeholder: 'Thread, labels, buttons, trim…' },
  ]},
];

export default async function StackPage({ params }) {
  const { id } = await params;
  const [mp, completeness] = await Promise.all([
    getProduct(id),
    getStackCompleteness(id),
  ]);

  if (!mp) return (
    <div className="py-12">
      <p className="text-text-secondary text-sm">Product not found.</p>
      <Link href="/products" className="text-brand text-sm">← Products</Link>
    </div>
  );

  const stack = mp.stack || {};
  const overall = completeness?.overall ?? 0;

  return (
    <div className="max-w-3xl">
      {/* Breadcrumb */}
      <div className="text-sm text-text-tertiary mb-4">
        <Link href="/products" className="text-brand no-underline hover:underline">Products</Link>
        <span className="mx-2">›</span>
        <Link href={`/products/${id}`} className="text-brand no-underline hover:underline">{mp.name}</Link>
        <span className="mx-2">›</span>
        <span>Stack</span>
      </div>

      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{mp.name} — Stack</h1>
        <div className="text-sm">
          <span className={`font-bold text-lg ${overall >= 80 ? 'text-success' : overall >= 50 ? 'text-warning' : 'text-danger'}`}>
            {overall}%
          </span>
          <span className="text-text-tertiary ml-1">complete</span>
        </div>
      </div>

      {/* Section completeness bar */}
      <div className="mb-6 space-y-1.5">
        {SECTIONS.filter(s => s.weight > 0).map(sec => {
          const secData = completeness?.sections?.[sec.id] || {};
          const pct = secData.pct ?? 0;
          return (
            <div key={sec.id} className="flex items-center gap-3 text-[12px]">
              <span className="text-text-tertiary w-36 flex-shrink-0">{sec.label}</span>
              <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-success' : pct > 0 ? 'bg-warning' : 'bg-border'}`}
                  style={{ width: `${pct}%` }} />
              </div>
              <span className={`w-8 text-right font-mono ${pct >= 100 ? 'text-success' : pct > 0 ? 'text-warning' : 'text-text-tertiary'}`}>
                {pct}%
              </span>
              <span className="text-text-tertiary w-12 text-right">{sec.weight}%</span>
            </div>
          );
        })}
      </div>

      {/* Editor — client component */}
      <StackEditor mpId={id} sections={SECTIONS} initialStack={stack} category={mp.category} />
    </div>
  );
}
