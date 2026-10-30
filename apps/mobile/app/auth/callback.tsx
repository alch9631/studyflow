import { Redirect } from "expo-router";

// openAuthSessionAsync verifies state and exchanges the one-use PKCE code.
export default function AuthCallback() { return <Redirect href="/" />; }
