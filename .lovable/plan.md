## Security: gitignore + env template

1. **Update `.gitignore`**: append `.env` and `.env.*` entries (check current contents first to avoid duplicates).

2. **Create `.env.example`** with placeholder keys:
   ```
   SUPABASE_PROJECT_ID=
   SUPABASE_PUBLISHABLE_KEY=
   SUPABASE_URL=
   VITE_SUPABASE_PROJECT_ID=
   VITE_SUPABASE_PUBLISHABLE_KEY=
   VITE_SUPABASE_URL=
   OPENAI_API_KEY=
   ```

No code or runtime behavior changes.