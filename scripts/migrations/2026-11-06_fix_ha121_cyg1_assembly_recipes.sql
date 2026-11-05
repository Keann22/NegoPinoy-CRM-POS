-- Fix HA121 Wok with CYG1 takip assembly recipes to use +2cm (1 size larger) covers

-- 1. Ha121 Wok pan - 34cm with takip (cyg1) -> 36CM CYG1 cover
UPDATE public.products
SET assembly_recipe = jsonb_build_array(
  jsonb_build_object('quantity', 1, 'productId', '3080f65e-4dd9-4483-8790-60166c9010b5', 'productName', 'Ha121 Wok pan - 34cm'),
  jsonb_build_object('quantity', 1, 'productId', '7cf89eb0-bd86-4b85-9195-2fae45b0a6b3', 'productName', 'CYG1 LID COVER (HALF STAINLESS MID GLASS) - 36CM')
)
WHERE id = '90b4a6a1-c25c-4089-a911-babcddcd93af';

-- 2. Ha121 Wok pan - 36cm with takip (cyg1) -> 38CM CYG1 cover
UPDATE public.products
SET assembly_recipe = jsonb_build_array(
  jsonb_build_object('quantity', 1, 'productId', '34816961-812c-4259-bece-60865a700c3a', 'productName', 'Ha121 Wok pan - 36cm'),
  jsonb_build_object('quantity', 1, 'productId', '90423318-4527-4e20-b69c-fca11c601e31', 'productName', 'CYG1 LID COVER (HALF STAINLESS MID GLASS) - 38CM')
)
WHERE id = 'd244ecd9-010e-4436-9f68-058f2b2bcd2f';

-- 3. Ha121 Wok pan - 38cm with takip (cyg1) -> 40CM CYG1 cover
UPDATE public.products
SET assembly_recipe = jsonb_build_array(
  jsonb_build_object('quantity', 1, 'productId', 'c49bf4f4-a713-4b42-8b9c-4d751429632f', 'productName', 'Ha121 Wok pan - 38cm'),
  jsonb_build_object('quantity', 1, 'productId', 'f432930b-e812-455f-aafc-ff4fae818cfe', 'productName', 'CYG1 LID COVER (HALF STAINLESS MID GLASS) - 40CM')
)
WHERE id = '49687317-a3ef-47ce-8022-ca3ec0fc4d0c';

-- 4. Ha121 Wok pan - 40cm with takip (cyg1) -> 42CM CYG1 cover
UPDATE public.products
SET assembly_recipe = jsonb_build_array(
  jsonb_build_object('quantity', 1, 'productId', 'fdc08570-2cbf-4c69-a1cd-16c4cbf7377f', 'productName', 'Ha121 Wok pan - 40cm'),
  jsonb_build_object('quantity', 1, 'productId', 'f21600b6-b532-4cca-b266-1ac897d169a2', 'productName', 'CYG1 LID COVER (HALF STAINLESS MID GLASS) - 42CM')
)
WHERE id = '465e081a-5560-4358-b516-976dc99c6cde';
