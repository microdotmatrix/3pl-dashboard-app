# Tech Stack

## Project Overview

- **Name**: 3pl-dashboard-app
- **Version**: 0.1.0
- **Type**: Next.js Dashboard Application with Authentication

---

## Core Framework

| Technology | Version | Purpose |
|------------|---------|---------|
| [Next.js](https://nextjs.org) | 16.2.4 | React framework with App Router |
| [React](https://react.dev) | 19.2.4 | UI library |
| [React DOM](https://react.dev) | 19.2.4 | DOM renderer |
| [TypeScript](https://www.typescriptlang.org) | ^5 | Type safety |

---

## UI & Styling

| Technology | Version | Purpose |
|------------|---------|---------|
| [Tailwind CSS](https://tailwindcss.com) | ^4 | Utility-first CSS framework |
| [Shadcn UI](https://ui.shadcn.com) | ^4.4.0 | Component library |
| [Radix UI](https://www.radix-ui.com) | ^1.4.3 | Headless UI primitives |
| [Base UI](https://base-ui.com) | ^1.4.1 | Low-level UI components |
| [HugeIcons](https://hugeicons.com) | ^4.1.1 / ^1.1.6 | Icon library |
| [Tailwind Merge](https://github.com/dcastil/tailwind-merge) | ^3.5.0 | Tailwind class merging |
| [CLSX](https://github.com/lukeed/clsx) | ^2.1.1 | Conditional class names |
| [TW Animate CSS](https://github.com/jamiebuilds/tailwindcss-animate) | ^1.4.0 | Tailwind animations |

### Shadcn Configuration

- **Style**: `radix-mira`
- **Base Color**: `neutral`
- **CSS Variables**: Enabled
- **Icon Library**: `hugeicons`
- **RSC**: Enabled
- **TypeScript**: Enabled

---

## Database & ORM

| Technology | Version | Purpose |
|------------|---------|---------|
| [Neon PostgreSQL](https://neon.tech) | — | Serverless Postgres |
| [Drizzle ORM](https://orm.drizzle.team) | ^0.45.2 | Type-safe SQL ORM |
| [Drizzle Kit](https://orm.drizzle.team/kit-docs/overview) | ^0.31.10 | Migrations & studio |
| [@neondatabase/serverless](https://neon.tech) | ^1.1.0 | Neon serverless driver |
| [pg](https://node-postgres.com) | ^8.20.0 | PostgreSQL client |

### Database Scripts

```bash
pnpm db:generate    # Generate Drizzle migrations
pnpm db:migrate     # Run migrations
pnpm db:push        # Push schema changes
pnpm db:studio      # Open Drizzle Studio
```

---

## Authentication

| Technology | Version | Purpose |
|------------|---------|---------|
| [Better Auth](https://www.better-auth.com) | ^1.6.7 | Authentication framework |

---

## Environment & Configuration

| Technology | Version | Purpose |
|------------|---------|---------|
| [@t3-oss/env-nextjs](https://env.t3.gg) | ^0.13.11 | Type-safe environment variables |
| [Zod](https://zod.dev) | ^4.3.6 | Schema validation |
| [dotenv](https://github.com/motdotla/dotenv) | ^17.4.2 | Environment file loading |

---

## Additional Libraries

| Technology | Version | Purpose |
|------------|---------|---------|
| [Recharts](https://recharts.org) | 3.8.0 | Data visualization charts |
| [date-fns](https://date-fns.org) | ^4.1.0 | Date utility library |
| [cmdk](https://cmdk.paco.me) | ^1.1.1 | Command palette |
| [Vaul](https://vaul.emilkowal.ski) | ^1.1.2 | Drawer component |
| [Sonner](https://sonner.emilkowal.ski) | ^2.0.7 | Toast notifications |
| [react-day-picker](https://react-day-picker.js.org) | ^9.14.0 | Date picker component |
| [next-themes](https://github.com/pacocoursey/next-themes) | ^0.4.6 | Theme management |

---

## Development Tools

| Technology | Version | Purpose |
|------------|---------|---------|
| [Biome](https://biomejs.dev) | 2.2.0 | Linter & formatter |
| [Babel React Compiler](https://react.dev/learn/react-compiler) | 1.0.0 | React Compiler optimization |

### Code Quality

- **Linter**: Biome with Next.js and React recommended rules
- **Formatter**: Biome with 2-space indentation
- **React Compiler**: Enabled in Next.js config
- **Strict TypeScript**: Enabled

### Available Scripts

```bash
pnpm dev            # Start development server
pnpm build          # Build for production
pnpm start          # Start production server
pnpm lint           # Run Biome linter
pnpm format         # Format code with Biome
```

---

## Project Structure

```
3pl-dashboard-app/
├── src/
│   ├── app/              # Next.js App Router
│   │   ├── (auth)/       # Auth routes (group)
│   │   ├── admin/        # Admin dashboard
│   │   └── api/          # API routes
│   ├── components/       # React components
│   │   ├── admin/
│   │   ├── auth/
│   │   └── ui/           # Shadcn UI components
│   ├── db/               # Database configuration
│   │   ├── schema/       # Drizzle schemas
│   │   └── index.ts      # DB connection
│   └── hooks/            # Custom React hooks
├── drizzle/              # Migration files
├── public/               # Static assets
├── components.json         # Shadcn configuration
├── next.config.ts        # Next.js configuration
├── drizzle.config.ts     # Drizzle configuration
├── biome.json            # Biome configuration
└── tsconfig.json         # TypeScript configuration
```

---

## Key Configuration

### TypeScript (tsconfig.json)

- Target: ES2017
- Module: ESNext
- JSX: react-jsx
- Strict mode enabled
- Path alias: `@/*` → `./src/*`

### Next.js (next.config.ts)

```typescript
{
  reactCompiler: true  // React 19 compiler enabled
}
```

### Biome (biome.json)

- Next.js and React recommended rules enabled
- Automatic import organization
- Git integration with ignore file support

---

## Development Notes

### React 19 Features

- Uses React 19.2.4 with new features
- React Compiler enabled for automatic optimization
- Server Components enabled by default

### Styling Approach

- Tailwind CSS v4 with CSS-first configuration
- Neutral base color palette
- CSS variables for theming
- Dark/light theme support via next-themes

### Database Workflow

- Neon serverless PostgreSQL
- Drizzle ORM for type-safe queries
- Drizzle Kit for schema management
- Migrations stored in `drizzle/` directory

---

## Package Manager

**pnpm** (evident from `pnpm-lock.yaml` and `pnpm-workspace.yaml`)
