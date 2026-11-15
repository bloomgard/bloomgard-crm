"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** /signup is the login page in sign-up mode. */
export default function SignupRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/login?mode=signup"); }, [router]);
  return null;
}
