import React from "react";
import { auth } from "../firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";

function AuthStatus() {
    const [user, setUser] = React.useState(null);

    React.useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
        });
        return () => unsubscribe();
    }, []);

    const handleLogout = () => {
        signOut(auth);
    };

    return (
        <div style={{ position: "absolute", top: 10, right: 10 }}>
            {user ? (
                <>
                    <span>{user.displayName || user.email}님</span>
                    <button onClick={handleLogout}>로그아웃</button>
                </>
            ) : null}
        </div>
    );
}

export default AuthStatus;
