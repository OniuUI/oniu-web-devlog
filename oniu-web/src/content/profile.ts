export const profile = {
  name: 'Marius Magnussen',
  handle: 'OniuUI',
  location: 'Oslo, Norway',
  tagline: 'Building product-quality software with a focus on speed, UX, and reliability.',
  linkedinSummary:
    'Software engineer and founder building practical automation products and high-efficiency energy technology.',
  links: {
    github: 'https://github.com/OniuUI',
    linkedin: 'https://www.linkedin.com/in/mariusmagnussen/',
    email: 'mailto:hello@oniu.dev',
  },
  companies: [
    {
      name: 'Boligsektor',
      description:
        'Automation tool for researching the property market in Norway.',
    },
    {
      name: 'Hydrodynamic',
      description:
        'Gas turbine company building high-efficiency steam turbines.',
    },
  ],
  flyDeployments: [
    { name: 'Boligsektor (test)', url: 'https://boligsektor-reave-v0-test.fly.dev/' },
    { name: 'Boligsektor (prod)', url: 'https://boligsektor-reave-v0-prod.fly.dev/' },
  ],
  legacyApps: [
    { slug: 'planner', title: 'Planner', description: 'Course planning & workflows.' },
    { slug: 'portfolio', title: 'Portfolio', description: 'Old portfolio site.' },
    { slug: 'tabuss', title: 'Tabuss', description: 'Legacy app (WordPress-based).' },
    { slug: 'infoscreen', title: 'Infoscreen', description: 'Display dashboard.' },
    { slug: 'los', title: 'LOS', description: 'Legacy LOS page.' },
    { slug: 'meieriet', title: 'Meieriet', description: 'Legacy site.' },
  ],
} as const


