import modal

app = modal.App("test-app")

image = modal.Image.debian_slim().pip_install(["fastapi", "uvicorn"])

@app.function(image=image)
@modal.fastapi_endpoint()
def test():
    from fastapi import FastAPI
    import uvicorn
    
    app = FastAPI()
    
    @app.get("/")
    def root():
        return {"message": "Hello from Modal!"}
    
    @app.get("/health")
    def health():
        return {"status": "healthy"}
    
    uvicorn.run(app, host="0.0.0.0", port=8000)

if __name__ == "__main__":
    with app.run():
        pass
