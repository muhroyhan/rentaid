import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  createVendorProductRequest,
  updateVendorProductRequest,
  uploadVendorMediaRequest,
} from "../data/productFormApi";
import {
  Product,
  ProductInput,
  acceptedTypes,
  maxPhotoBytes,
} from "../ProductForm.model";
export function useProductForm({
  product,
  csrfToken,
  onSaved,
  onCancel,
}: {
  product: Product | null;
  csrfToken: string;
  onSaved: (product: Product) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [price, setPrice] = useState(product ? String(product.dailyPrice) : "");
  const [stock, setStock] = useState(product ? String(product.stock) : "");
  const [photos, setPhotos] = useState<string[]>(product?.photoIds ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const dirty =
    name !== (product?.name ?? "") ||
    description !== (product?.description ?? "") ||
    categoryId !== (product?.categoryId ?? "") ||
    price !== (product ? String(product.dailyPrice) : "") ||
    stock !== (product ? String(product.stock) : "") ||
    JSON.stringify(photos) !== JSON.stringify(product?.photoIds ?? []);
  function cancel() {
    if (
      dirty &&
      !window.confirm("Perubahan belum disimpan. Tinggalkan formulir?")
    )
      return;
    onCancel();
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setError("");
    setNotice("");
    if (photos.length + files.length > 10) {
      setError("Maksimal 10 foto untuk setiap produk.");
      return;
    }
    if (
      files.some(
        (file) =>
          (file.type !== "" && !acceptedTypes.has(file.type)) ||
          file.size === 0 ||
          file.size > maxPhotoBytes,
      )
    ) {
      setError(
        "Pilih gambar JPEG, PNG, atau WebP dengan ukuran maksimal 5 MB per foto.",
      );
      return;
    }
    setBusy(true);
    let uploaded = 0;
    try {
      for (const file of files) {
        const response = await uploadVendorMediaRequest({
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-CSRF-Token": csrfToken,
          },
          body: file,
        });
        if (response.status === 401) {
          window.location.assign("/masuk");
          return;
        }
        const body = (await response.json().catch(() => ({}))) as {
          id?: string;
          message?: string;
        };
        if (!response.ok || !body.id)
          throw new Error(body.message ?? "Foto tidak dapat diunggah.");
        const id = body.id;
        setPhotos((current) => [...current, id]);
        uploaded++;
      }
      setNotice(`${uploaded} foto berhasil diunggah.`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Foto tidak dapat diunggah.",
      );
      if (uploaded)
        setNotice(
          `${uploaded} foto berhasil diunggah sebelum terjadi kesalahan.`,
        );
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const dailyPrice = Number(price);
    const amount = Number(stock);
    if (
      !name.trim() ||
      !description.trim() ||
      !categoryId ||
      price === "" ||
      stock === "" ||
      !Number.isSafeInteger(dailyPrice) ||
      dailyPrice <= 0 ||
      !Number.isInteger(amount) ||
      amount < 0 ||
      amount > 2147483647
    ) {
      setError(
        "Isi data produk dengan harga harian positif dan stok berupa bilangan bulat tidak negatif.",
      );
      return;
    }
    const body: ProductInput = {
      name,
      description,
      categoryId,
      dailyPrice,
      stock: amount,
      photoIds: photos,
    };
    setBusy(true);
    try {
      const result = product
        ? await updateVendorProductRequest({
            params: { path: { id: product.id } },
            headers: { "X-CSRF-Token": csrfToken },
            body,
          })
        : await createVendorProductRequest({
            headers: { "X-CSRF-Token": csrfToken },
            body,
          });
      if (result.response.status === 401) {
        window.location.assign("/masuk");
        return;
      }
      if (!result.data)
        throw new Error(
          result.error?.message ?? "Produk tidak dapat disimpan.",
        );
      onSaved(result.data);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Produk tidak dapat disimpan.",
      );
    } finally {
      setBusy(false);
    }
  }
  return {
    name,
    setName,
    description,
    setDescription,
    categoryId,
    setCategoryId,
    price,
    setPrice,
    stock,
    setStock,
    photos,
    setPhotos,
    busy,
    error,
    notice,
    headingRef,
    cancel,
    upload,
    save,
  };
}
