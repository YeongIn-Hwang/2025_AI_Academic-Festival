import React, { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { doc, onSnapshot } from "firebase/firestore";

export default function DebugUserParams() {
  const [data, setData] = useState(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const ref = doc(db, "user_params", user.uid);

    // Firestore 실시간 구독
    const unsub = onSnapshot(ref, (snap) => {
      setData(snap.exists() ? snap.data() : null);
    });

    return () => unsub();
  }, []);

  if (!auth.currentUser) {
    return <div style={{ padding: 20 }}>로그인이 필요합니다.</div>;
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Firestore user_params 확인</h2>
      <pre
        style={{
          background: "#f7f7f7",
          padding: 12,
          borderRadius: 8,
          whiteSpace: "pre-wrap",
        }}
      >
        {data ? JSON.stringify(data, null, 2) : "문서가 아직 없습니다."}
      </pre>
    </div>
  );
}