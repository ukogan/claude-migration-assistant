export const STEPS = [
  {
    id: 'a1',
    track: 'a',
    title: 'Run Native Data Export',
    subtitle: 'Export your data from the old Claude account',
    section: 'Track A: Automated'
  },
  {
    id: 'a2',
    track: 'a',
    title: 'Upload & Process Export',
    subtitle: 'Add your export manifest and ZIP files for client-side processing',
    section: 'Track A: Automated'
  },
  {
    id: 'a3',
    track: 'a',
    title: 'Review Context Document',
    subtitle: 'Review and edit the auto-generated context document',
    section: 'Track A: Automated'
  },
  {
    id: 'a4',
    track: 'a',
    title: 'Review Artifacts',
    subtitle: 'Mark important artifacts for migration',
    section: 'Track A: Automated'
  },
  {
    id: 'b1',
    track: 'b',
    title: 'Capture Memory',
    subtitle: 'Export memory from old account via prompt',
    section: 'Track B: Manual'
  },
  {
    id: 'b2',
    track: 'b',
    title: 'Capture Project Blueprints',
    subtitle: 'Export project details from old account',
    section: 'Track B: Manual'
  },
  {
    id: 'b3',
    track: 'b',
    title: 'Restore Memory',
    subtitle: 'Seed memory in the new account',
    section: 'Track B: Manual'
  },
  {
    id: 'b4',
    track: 'b',
    title: 'Recreate Projects',
    subtitle: 'Set up projects in the new account',
    section: 'Track B: Manual'
  },
  {
    id: 'b5',
    track: 'b',
    title: 'Upload Critical Artifacts',
    subtitle: 'Upload important artifacts to new account projects',
    section: 'Track B: Manual'
  },
  {
    id: 'b6',
    track: 'b',
    title: 'Validate Migration',
    subtitle: 'Verify everything transferred correctly',
    section: 'Track B: Manual'
  }
];

export const TRACKS = {
  a: { label: 'Track A: Automated', color: 'a' },
  b: { label: 'Track B: Manual', color: 'b' }
};

export function getStep(id) {
  return STEPS.find(s => s.id === id);
}

export function getStepsByTrack(track) {
  return STEPS.filter(s => s.track === track);
}
