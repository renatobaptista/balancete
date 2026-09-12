import React from "react";
import ReactDOM from "react-dom/client";
import { supabase } from "./lib/supabaseClient";
import Auth from "./Auth.jsx";
import App from "./App.jsx";

function Root() {
  const [session, setSession] = React.useState(undefined); // undefined = loading, null = logged out

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;
  if (!session) return <Auth />;
  return <App session={session} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
