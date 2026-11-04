-- Apply once to a fresh, seeded Android integration test database.
INSERT INTO content_pages(page_key,title,body,published_title,published_body,published_at,updated_at)
VALUES
    ('home','Beranda Uji','Konten CMS terbit','Beranda Uji','Konten CMS terbit',now(),now()),
    ('faq','FAQ Uji','Jawaban dari CMS','FAQ Uji','Jawaban dari CMS',now(),now());

INSERT INTO products(store_id,category_id,name,description,daily_price,stock,published,created_at,updated_at)
SELECT store_id,category_id,'Kamera Phase20 ' || n,'Kamera test',12000,2,true,now(),now()
FROM products CROSS JOIN generate_series(1,23) n WHERE name='Kamera Mirrorless';

INSERT INTO products(id,store_id,category_id,name,description,daily_price,stock,published,created_at,updated_at)
SELECT '00000000-0000-4000-8000-000000000020',store_id,category_id,
       'Produk tersembunyi Phase20','Produk tidak terbit',12000,1,false,now(),now()
FROM products WHERE name='Kamera Mirrorless';

-- The file intentionally does not exist, to exercise image error handling.
INSERT INTO media(id,filename,content_type,size_bytes,created_at)
VALUES ('00000000-0000-4000-8000-000000000021','missing-phase20.jpg','image/jpeg',100,now());
INSERT INTO product_photos(product_id,media_id,position)
SELECT id,'00000000-0000-4000-8000-000000000021',0 FROM products WHERE name='Kamera Mirrorless';
