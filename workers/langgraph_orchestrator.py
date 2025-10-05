"""
Orchestrateur LangGraph pour AlphogenAI Mini
Pipeline: Qwen (script 4 scènes) → WAN Image → Pika (4 clips 4s) → ElevenLabs → Remotion
Sauvegarde l'état à chaque étape dans Supabase (jobs.app_state)
"""
import asyncio
import random
from typing import Dict, Any, TypedDict, Annotated, Sequence
from datetime import datetime, timezone
import httpx

from langgraph.graph import StateGraph, END
from langchain_core.messages import BaseMessage

from .config import get_settings
from .supabase_client import SupabaseClient
from .api_services import (
    QwenService,
    WANImageService,
    PikaService,
    ElevenLabsService,
    RemotionService,
    generate_video_clip,
    generate_elevenlabs_voice,
    render_with_remotion,
)


class WorkflowState(TypedDict):
    """État LangGraph passé entre les nœuds"""
    job_id: str
    user_id: str
    prompt: str
    
    # Résultats de chaque étape
    script: Dict[str, Any]
    key_visual: Dict[str, Any]
    clips: list[Dict[str, Any]]
    audio: Dict[str, Any]
    final_video: Dict[str, Any]
    
    # Gestion erreurs
    error: str | None
    retry_count: int
    
    # LangChain compatibility
    messages: Annotated[Sequence[BaseMessage], "messages"]


class AlphogenAIOrchestrator:
    """Orchestrateur LangGraph pour génération vidéo AlphogenAI Mini"""
    
    def __init__(self):
        self.settings = get_settings()
        self.supabase = SupabaseClient()
        
        # Initialiser les services AI
        self.qwen = QwenService()
        self.wan_image = WANImageService()
        self.pika = PikaService()
        self.elevenlabs = ElevenLabsService()
        self.remotion = RemotionService()
        
        # Construire le workflow LangGraph
        self.workflow = self._build_workflow()
    
    def _build_workflow(self) -> StateGraph:
        """Construit le workflow LangGraph avec 6 étapes"""
        workflow = StateGraph(WorkflowState)
        
        # Ajouter les nœuds du pipeline
        workflow.add_node("qwen_script", self._node_qwen_script)
        workflow.add_node("wan_image", self._node_wan_image)
        workflow.add_node("pika_clips", self._node_pika_clips)
        workflow.add_node("elevenlabs_audio", self._node_elevenlabs_audio)
        workflow.add_node("remotion_assembly", self._node_remotion_assembly)
        workflow.add_node("webhook_notify", self._node_webhook_notify)
        
        # Définir le flux
        workflow.set_entry_point("qwen_script")
        workflow.add_edge("qwen_script", "wan_image")
        workflow.add_edge("wan_image", "pika_clips")
        workflow.add_edge("pika_clips", "elevenlabs_audio")
        workflow.add_edge("elevenlabs_audio", "remotion_assembly")
        workflow.add_edge("remotion_assembly", "webhook_notify")
        workflow.add_edge("webhook_notify", END)
        
        return workflow.compile()
    
    async def _save_state(
        self,
        job_id: str,
        state: WorkflowState,
        stage: str,
        status: str = "in_progress"
    ) -> None:
        """Sauvegarde l'état complet dans jobs.app_state"""
        app_state = {
            "prompt": state["prompt"],
            "script": state.get("script", {}),
            "key_visual": state.get("key_visual", {}),
            "clips": state.get("clips", []),
            "audio": state.get("audio", {}),
            "final_video": state.get("final_video", {}),
            "retry_count": state.get("retry_count", 0),
            "last_stage": stage,
            "timestamp": datetime.utcnow().isoformat(),
        }
        
        await self.supabase.update_job_state(
            job_id=job_id,
            app_state=app_state,
            status=status,
            current_stage=stage,
            error_message=state.get("error")
        )
    
    async def _node_qwen_script(self, state: WorkflowState) -> WorkflowState:
        """Étape 1: Génération script avec Qwen (4 scènes)"""
        try:
            print(f"[Qwen] Génération du script pour job {state['job_id']}")
            print(f"[Qwen] API Base: {self.qwen.base_url}")
            print(f"[Qwen] API Key configured: {bool(self.qwen.api_key)}")
            
            # Générer le script
            script_result = await self.qwen.generate_script(state["prompt"])
            
            # Limiter à exactement 4 scènes
            script_result["scenes"] = script_result["scenes"][:4]
            
            state["script"] = script_result
            
            # Sauvegarder l'état
            await self._save_state(state["job_id"], state, "qwen_script")
            
            print(f"[Qwen] ✓ Script généré: {len(script_result['scenes'])} scènes")
            return state
            
        except Exception as e:
            print(f"[Qwen] ✗ Erreur: {str(e)}")
            state["error"] = f"Qwen script error: {str(e)}"
            await self._handle_error(state)
            raise
    
    async def _node_wan_image(self, state: WorkflowState) -> WorkflowState:
        """Étape 2: Génération image clé avec WAN Image"""
        try:
            print(f"[WAN Image] Génération de l'image clé pour job {state['job_id']}")
            
            # Utiliser la description de la première scène
            first_scene = state["script"]["scenes"][0]["description"]
            
            # Générer l'image clé
            visual_result = await self.wan_image.generate_image(
                first_scene,
                style="cinematic"
            )
            
            state["key_visual"] = visual_result
            
            # Sauvegarder l'état
            await self._save_state(state["job_id"], state, "wan_image")
            
            print(f"[WAN Image] ✓ Image clé générée: {visual_result['image_url']}")
            return state
            
        except Exception as e:
            print(f"[WAN Image] ✗ Erreur: {str(e)}")
            state["error"] = f"WAN Image error: {str(e)}"
            await self._handle_error(state)
            raise
    
    async def _node_pika_clips(self, state: WorkflowState) -> WorkflowState:
        """Étape 3: Génération 4 clips vidéo (WAN/Pika selon VIDEO_ENGINE)"""
        try:
            # Lire le moteur vidéo depuis config
            video_engine = self.settings.VIDEO_ENGINE
            print(f"[Video] Génération de 4 clips avec moteur: {video_engine.upper()}")
            print(f"[Video] Job: {state['job_id']}")
            
            scenes = state["script"]["scenes"]
            key_visual_url = state["key_visual"]["image_url"]
            
            # Générer seed pour cohérence visuelle (utilisé par Pika)
            base_seed = random.randint(1000, 9999)
            
            # Générer les 4 clips en parallèle
            tasks = []
            for i, scene in enumerate(scenes):
                # Le premier clip utilise l'image clé (pour Pika)
                image_url = key_visual_url if i == 0 and video_engine == "pika" else None
                seed = base_seed + i if video_engine == "pika" else None
                
                tasks.append(
                    generate_video_clip(
                        engine=video_engine,
                        prompt=scene["description"],
                        image_url=image_url,
                        seed=seed
                    )
                )
            
            # Exécuter en parallèle
            clip_results = await asyncio.gather(*tasks)
            
            # Formater les résultats
            clips = []
            for i, clip_result in enumerate(clip_results):
                clips.append({
                    "index": i,
                    "scene": scenes[i],
                    "engine": clip_result.get("engine", video_engine),
                    **clip_result
                })
            
            state["clips"] = clips
            
            # Sauvegarder l'état
            await self._save_state(state["job_id"], state, "video_clips")
            
            print(f"[Video] ✓ {len(clips)} clips générés avec {video_engine.upper()}")
            return state
            
        except Exception as e:
            print(f"[Video] ✗ Erreur: {str(e)}")
            state["error"] = f"Video clips error: {str(e)}"
            await self._handle_error(state)
            raise
    
    async def _node_elevenlabs_audio(self, state: WorkflowState) -> WorkflowState:
        """Étape 4: Génération audio + SRT avec ElevenLabs"""
        try:
            print(f"[ElevenLabs] Génération audio pour job {state['job_id']}")
            
            # Combiner toutes les narrations en script unique
            full_narration = " ".join([
                scene["narration"].strip()
                for scene in state["script"]["scenes"]
            ])
            
            print(f"[ElevenLabs] Texte: {len(full_narration)} caractères")
            
            # Générer l'audio avec upload Supabase Storage + SRT
            audio_result = await generate_elevenlabs_voice(
                text=full_narration,
                voice_id="eleven_multilingual_v2",
                language="fr"  # Français par défaut
            )
            
            # Stocker dans app_state["audio"]
            state["audio"] = {
                "audio_url": audio_result["audio_url"],
                "srt": audio_result["srt"],
                "duration": audio_result["duration"]
            }
            
            # Sauvegarder l'état
            await self._save_state(state["job_id"], state, "elevenlabs_audio")
            
            print(f"[ElevenLabs] ✓ Audio généré: {audio_result['duration']:.1f}s")
            print(f"[ElevenLabs] ✓ URL: {audio_result['audio_url']}")
            print(f"[ElevenLabs] ✓ SRT: {len(audio_result['srt'].split(chr(10)))} lignes")
            return state
            
        except Exception as e:
            print(f"[ElevenLabs] ✗ Erreur: {str(e)}")
            state["error"] = f"ElevenLabs audio error: {str(e)}"
            await self._handle_error(state)
            raise
    
    async def _node_remotion_assembly(self, state: WorkflowState) -> WorkflowState:
        """Étape 5: Assemblage final avec Remotion Cloud"""
        try:
            print(f"[Remotion] Assemblage vidéo finale pour job {state['job_id']}")
            
            # Récupérer audio_url depuis state (uploadé par ElevenLabs)
            audio_url = state["audio"].get("audio_url", "")
            srt_content = state["audio"].get("srt", "")
            
            # Logo optionnel (peut être ajouté dans config)
            logo_url = getattr(self.settings, 'LOGO_URL', None)
            
            # Assembler avec Remotion Cloud
            video_result = await render_with_remotion(
                clips=state["clips"],
                audio_url=audio_url,
                srt=srt_content,
                logo_url=logo_url
            )
            
            final_url = video_result["final_video_url"]
            
            # Stocker résultat
            state["final_video"] = {
                "final_video_url": final_url,
                "render_id": video_result["render_id"],
                "clips_count": len(state["clips"]),
                "total_duration": sum(clip.get("duration", 6) for clip in state["clips"])
            }
            
            # Sauvegarder l'état final
            await self.supabase.update_job_state(
                job_id=state["job_id"],
                app_state={
                    "prompt": state["prompt"],
                    "script": state["script"],
                    "key_visual": state["key_visual"],
                    "clips": state["clips"],
                    "audio": state["audio"],
                    "final_video": state["final_video"],
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                },
                status="done",
                current_stage="completed",
                video_url=final_url,
                final_url=final_url
            )
            
            # Sauvegarder dans le cache
            await self.supabase.save_to_cache(
                prompt=state["prompt"],
                video_url=video_result["video_url"],
                metadata={
                    "scenes": len(state["clips"]),
                    "duration": sum(clip["duration"] for clip in state["clips"]),
                    "created_at": datetime.utcnow().isoformat(),
                }
            )
            
            print(f"[Remotion] ✓ Vidéo finale: {final_url}")
            return state
            
        except Exception as e:
            print(f"[Remotion] ✗ Erreur: {str(e)}")
            state["error"] = f"Remotion assembly error: {str(e)}"
            await self._handle_error(state)
            raise
    
    async def _node_webhook_notify(self, state: WorkflowState) -> WorkflowState:
        """Étape 6: Notification webhook quand vidéo prête"""
        try:
            webhook_url = self.settings.WEBHOOK_URL
            
            if not webhook_url:
                print("[Webhook] Pas de webhook configuré, skip")
                return state
            
            print(f"[Webhook] Envoi notification pour job {state['job_id']}")
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                payload = {
                    "job_id": state["job_id"],
                    "user_id": state["user_id"],
                    "status": "completed",
                    "video_url": state["final_video"]["video_url"],
                    "prompt": state["prompt"],
                    "timestamp": datetime.utcnow().isoformat(),
                }
                
                headers = {"Content-Type": "application/json"}
                if self.settings.WEBHOOK_SECRET:
                    headers["X-Webhook-Secret"] = self.settings.WEBHOOK_SECRET
                
                response = await client.post(
                    webhook_url,
                    json=payload,
                    headers=headers
                )
                response.raise_for_status()
                
                print(f"[Webhook] ✓ Notification envoyée")
            
            return state
            
        except Exception as e:
            print(f"[Webhook] ⚠ Erreur (non-bloquant): {str(e)}")
            # Ne pas faire échouer le job si le webhook échoue
            return state
    
    async def _handle_error(self, state: WorkflowState) -> None:
        """Gestion des erreurs avec retry logic"""
        job_id = state["job_id"]
        retry_count = await self.supabase.increment_retry(job_id)
        
        if retry_count < self.settings.MAX_RETRIES:
            print(f"[Retry] Tentative {retry_count}/{self.settings.MAX_RETRIES}")
            await asyncio.sleep(self.settings.RETRY_DELAY)
            # Le retry sera géré par le worker qui relance le job
        else:
            print(f"[Error] Max retries atteint pour job {job_id}")
            await self.supabase.update_job_state(
                job_id=job_id,
                app_state={"error": state["error"]},
                status="failed",
                error_message=state["error"]
            )
    
    async def run(
        self,
        job_id: str,
        user_id: str,
        prompt: str
    ) -> Dict[str, Any]:
        """Exécute le workflow complet"""
        
        initial_state: WorkflowState = {
            "job_id": job_id,
            "user_id": user_id,
            "prompt": prompt,
            "script": {},
            "key_visual": {},
            "clips": [],
            "audio": {},
            "final_video": {},
            "error": None,
            "retry_count": 0,
            "messages": [],
        }
        
        print(f"\n{'='*70}")
        print(f"🎬 AlphogenAI Mini - Démarrage workflow")
        print(f"{'='*70}")
        print(f"Job ID: {job_id}")
        print(f"Prompt: {prompt}")
        print(f"{'='*70}\n")
        
        try:
            # Marquer comme en cours
            await self.supabase.update_job_state(
                job_id=job_id,
                app_state=initial_state,
                status="in_progress",
                current_stage="starting"
            )
            
            # Exécuter le workflow LangGraph
            final_state = await self.workflow.ainvoke(initial_state)
            
            print(f"\n{'='*70}")
            print(f"✅ Workflow terminé avec succès!")
            print(f"Vidéo: {final_state.get('final_video', {}).get('video_url', 'N/A')}")
            print(f"{'='*70}\n")
            
            return {
                "status": "success",
                "job_id": job_id,
                "video_url": final_state.get("final_video", {}).get("video_url"),
                "state": final_state,
            }
            
        except Exception as e:
            print(f"\n{'='*70}")
            print(f"❌ Workflow échoué")
            print(f"Erreur: {str(e)}")
            print(f"{'='*70}\n")
            
            return {
                "status": "failed",
                "job_id": job_id,
                "error": str(e),
            }


async def create_and_run_job(
    user_id: str,
    prompt: str
) -> Dict[str, Any]:
    """
    Fonction high-level pour créer et exécuter un job
    
    Usage:
        result = await create_and_run_job(
            user_id="user_123",
            prompt="Créer une vidéo sur l'IA en 2024"
        )
    """
    supabase = SupabaseClient()
    
    # Créer le job
    job_id = await supabase.create_job(
        user_id=user_id,
        prompt=prompt,
        initial_state={"created_at": datetime.utcnow().isoformat()}
    )
    
    # Exécuter l'orchestrateur
    orchestrator = AlphogenAIOrchestrator()
    result = await orchestrator.run(job_id, user_id, prompt)
    
    return result


# Point d'entrée CLI pour test
if __name__ == "__main__":
    import sys
    
    async def main():
        if len(sys.argv) < 2:
            print("Usage: python -m workers.langgraph_orchestrator <prompt>")
            sys.exit(1)
        
        prompt = " ".join(sys.argv[1:])
        result = await create_and_run_job(
            user_id="test_user",
            prompt=prompt
        )
        
        print("\n=== Résultat Final ===")
        print(f"Status: {result['status']}")
        if result['status'] == 'success':
            print(f"Vidéo URL: {result['video_url']}")
        else:
            print(f"Erreur: {result['error']}")
    
    asyncio.run(main())
