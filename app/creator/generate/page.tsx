"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import CreatorGenerateClient from "./ui/CreatorGenerateClient";

export default function GeneratePage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/auth/login');
        return;
      }
      
      setIsAuthenticated(true);
      setIsAdmin(user?.user_metadata?.role === 'admin');
      setCheckingAuth(false);
    }
    checkAuth();
  }, [router]);


  const handleCancelAllJobs = async () => {
    if (!confirm("Annuler TOUS les jobs en cours ?")) return;
    
    try {
      const res = await fetch("/api/admin/cancel-all-jobs", {
        method: "POST",
      });
      await res.json();
      alert("Jobs annulés");
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
  };

  const handleViewJobs = () => {
    router.push("/admin/jobs");
  };

  if (checkingAuth) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div>Vérification de l'authentification...</div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <CreatorGenerateClient
        isAdmin={isAdmin}
        onCancelAllJobs={handleCancelAllJobs}
        onViewJobs={handleViewJobs}
      />
    </main>
  );
}
