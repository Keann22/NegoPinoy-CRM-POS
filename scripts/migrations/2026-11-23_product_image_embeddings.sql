-- Migration: product_image_embeddings (2026-11-23)
-- Stores 768-dim multimodal embeddings (gemini-embedding-2) for visual product search.

CREATE TABLE IF NOT EXISTS public.product_image_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  embedding public.vector(768) NOT NULL,
  model text NOT NULL DEFAULT 'gemini-embedding-2',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_image_embeddings_product_url_key UNIQUE (product_id, image_url)
);

CREATE INDEX IF NOT EXISTS idx_product_image_embeddings_product_id
  ON public.product_image_embeddings (product_id);

CREATE INDEX IF NOT EXISTS idx_product_image_embeddings_hnsw
  ON public.product_image_embeddings
  USING hnsw (embedding public.vector_cosine_ops);

ALTER TABLE public.product_image_embeddings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.product_image_embeddings FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_image_embeddings TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'product_image_embeddings'
      AND policyname = 'Authenticated staff can manage product image embeddings'
  ) THEN
    CREATE POLICY "Authenticated staff can manage product image embeddings"
      ON public.product_image_embeddings
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.match_products_by_image_embedding(
  query_embedding public.vector(768),
  match_threshold float DEFAULT 0.70,
  match_count int DEFAULT 20
)
RETURNS TABLE (
  product_id uuid,
  parent_id uuid,
  root_id uuid,
  product_name text,
  variant_name text,
  matched_image_url text,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scored AS (
    SELECT
      e.product_id,
      p.parent_id,
      COALESCE(gp.id, p.parent_id, p.id) AS root_id,
      p.name AS product_name,
      p.variant_name,
      e.image_url AS matched_image_url,
      (1 - (e.embedding <=> query_embedding))::float AS similarity
    FROM public.product_image_embeddings e
    JOIN public.products p ON p.id = e.product_id
    LEFT JOIN public.products parent_p ON parent_p.id = p.parent_id
    LEFT JOIN public.products gp ON gp.id = parent_p.parent_id
    WHERE p.name NOT ILIKE '[DELETED]%'
      AND (parent_p.id IS NULL OR parent_p.name NOT ILIKE '[DELETED]%')
      AND (gp.id IS NULL OR gp.name NOT ILIKE '[DELETED]%')
      AND (1 - (e.embedding <=> query_embedding)) >= match_threshold
  ),
  deduped AS (
    SELECT DISTINCT ON (s.product_id)
      s.product_id,
      s.parent_id,
      s.root_id,
      s.product_name,
      s.variant_name,
      s.matched_image_url,
      s.similarity
    FROM scored s
    ORDER BY s.product_id, s.similarity DESC
  ),
  top_roots AS (
    SELECT
      d.root_id,
      MAX(d.similarity) AS root_similarity
    FROM deduped d
    GROUP BY d.root_id
    ORDER BY root_similarity DESC
    LIMIT match_count
  )
  SELECT
    d.product_id,
    d.parent_id,
    d.root_id,
    d.product_name,
    d.variant_name,
    d.matched_image_url,
    d.similarity
  FROM deduped d
  JOIN top_roots tr ON tr.root_id = d.root_id
  ORDER BY tr.root_similarity DESC, d.similarity DESC;
$$;

REVOKE ALL ON FUNCTION public.match_products_by_image_embedding(public.vector(768), float, int) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_products_by_image_embedding(public.vector(768), float, int) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
