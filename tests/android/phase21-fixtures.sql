-- Apply once after phase20-fixtures.sql to a fresh seeded test database.
INSERT INTO products(id,store_id,category_id,name,description,daily_price,stock,published,created_at,updated_at)
SELECT '00000000-0000-4000-8000-000000000030',store_id,category_id,
       'Kamera Balapan Phase21','Produk uji stok terakhir',45000,1,true,now(),now()
FROM products WHERE name='Kamera Mirrorless';
