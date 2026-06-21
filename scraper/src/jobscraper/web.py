from __future__ import annotations

from datetime import datetime

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from . import latex as latex_mod
from .db import init_db


def create_app() -> FastAPI:
    init_db()
    app = FastAPI(title="jobscraper API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(GZipMiddleware, minimum_size=500)

    @app.get("/api/cv/pdf/available")
    def api_cv_pdf_available():
        import shutil
        return {"available": bool(shutil.which("pdflatex"))}

    @app.post("/api/cv/pdf-from-tex")
    async def api_cv_pdf_from_tex(request: Request):
        """Stateless compile endpoint: client sends rendered .tex source,
        gets back PDF bytes. Each user's Convex profile is rendered to .tex
        client-side and then compiled here."""
        body = await request.body()
        if not body:
            raise HTTPException(400, "empty tex source")
        tex = body.decode("utf-8", errors="replace")
        result = latex_mod.compile_pdf(tex)
        if result is None:
            raise HTTPException(503, detail="pdflatex not installed")
        if isinstance(result, tuple):
            raise HTTPException(500, detail=f"pdflatex compile failed:\n{result[1][:2000]}")
        return Response(
            content=result,
            media_type="application/pdf",
            headers={"Content-Disposition": "inline; filename=cv.pdf"},
        )

    @app.get("/api/health")
    def health():
        return {"ok": True, "time": datetime.utcnow().isoformat() + "Z"}

    @app.on_event("startup")
    def _start_bots():
        from . import apply_bot
        apply_bot.start_polling()

    @app.on_event("shutdown")
    def _stop_bots():
        from . import apply_bot
        apply_bot.stop_polling()

    return app


app = create_app()
