// src/utils/storage.js
import { ref, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase"; // ✅ app 대신 storage import

export async function fetchImageURL(gsPath) {
    // ✅ gs:// → articles/ulsan_article.png 변환
    const path = gsPath.replace("gs://gabojago-67419.firebasestorage.app/", "");
    const fileRef = ref(storage, path);
    return await getDownloadURL(fileRef);
}
