-- Production lacked _dt_cols (used by dt_import and dt_save); creating it fixes "template import failed".
create or replace function public._dt_cols(p_content jsonb) returns record language sql immutable set search_path to 'public' as $$
  select p_content->>'title_ar', p_content->>'category_ar', p_content->>'issuer_candidate', coalesce(p_content->>'document_kind','decision_draft'),
         coalesce(p_content->'classification'->>'domain','other'), coalesce(p_content->'classification'->>'nature','administrative'), coalesce(p_content->>'risk','standard')
$$;
revoke all on function public._dt_cols(jsonb) from public, anon, authenticated;
