#!/usr/bin/env python3
"""
Deploy Stable Video Infinity (SVI) to Runpod Serverless

This script builds and deploys the SVI Docker image to Runpod Serverless
with A100 80GB GPU configuration.

Usage:
    python tools/deploy_svi.py [--build-only] [--deploy-only]
"""

import os
import sys
import json
import time
import argparse
import subprocess
from typing import Optional, Dict, Any
from pathlib import Path

try:
    import requests
except ImportError:
    print("Error: requests library not found. Installing...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests"])
    import requests


class RunpodDeployer:
    """Deploy SVI to Runpod Serverless."""
    
    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize Runpod deployer.
        
        Args:
            api_key: Runpod API key (reads from env if not provided)
        """
        self.api_key = api_key or os.getenv("RUNPOD_API_KEY")
        if not self.api_key:
            raise ValueError("RUNPOD_API_KEY not found in environment")
        
        self.base_url = "https://api.runpod.io/graphql"
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }
        
        self.project_root = Path(__file__).parent.parent
        self.svi_dir = self.project_root / "tools" / "svi"
        
    def _graphql_request(self, query: str, variables: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Make a GraphQL request to Runpod API.
        
        Args:
            query: GraphQL query string
            variables: Query variables
            
        Returns:
            Response data
        """
        payload = {"query": query}
        if variables:
            payload["variables"] = variables
        
        response = requests.post(
            self.base_url,
            headers=self.headers,
            json=payload
        )
        
        if response.status_code != 200:
            raise Exception(f"API request failed: {response.status_code} - {response.text}")
        
        data = response.json()
        
        if "errors" in data:
            raise Exception(f"GraphQL errors: {data['errors']}")
        
        return data.get("data", {})
    
    def build_docker_image(self, image_name: str = "svi-serverless", tag: str = "latest") -> str:
        """
        Build SVI Docker image.
        
        Args:
            image_name: Docker image name
            tag: Image tag
            
        Returns:
            Full image name with tag
        """
        print("=" * 60)
        print("Building SVI Docker Image")
        print("=" * 60)
        
        full_image = f"{image_name}:{tag}"
        
        dockerfile_path = self.svi_dir / "Dockerfile"
        if not dockerfile_path.exists():
            raise FileNotFoundError(f"Dockerfile not found at {dockerfile_path}")
        
        print(f"\n📦 Building image: {full_image}")
        print(f"📁 Context: {self.svi_dir}")
        print()
        
        try:
            cmd = [
                "docker", "build",
                "-t", full_image,
                "-f", str(dockerfile_path),
                str(self.svi_dir)
            ]
            
            print(f"Running: {' '.join(cmd)}")
            print()
            
            result = subprocess.run(
                cmd,
                check=True,
                capture_output=False,
                text=True
            )
            
            print(f"\n✅ Image built successfully: {full_image}")
            return full_image
            
        except subprocess.CalledProcessError as e:
            print(f"\n❌ Docker build failed: {e}")
            raise
    
    def push_to_registry(self, image_name: str, registry: str = "docker.io") -> str:
        """
        Push Docker image to container registry.
        
        Args:
            image_name: Local image name
            registry: Container registry (docker.io, ghcr.io, etc.)
            
        Returns:
            Full registry image path
        """
        print("\n" + "=" * 60)
        print("Pushing Image to Registry")
        print("=" * 60)
        
        
        username = os.getenv("DOCKER_USERNAME")
        if not username:
            print("\n⚠️  DOCKER_USERNAME not set. Skipping push.")
            print("   You'll need to manually push the image or set DOCKER_USERNAME")
            return image_name
        
        registry_image = f"{registry}/{username}/{image_name}"
        
        print(f"\n📤 Tagging image for registry: {registry_image}")
        
        try:
            subprocess.run(
                ["docker", "tag", image_name, registry_image],
                check=True
            )
            
            print(f"📤 Pushing to registry...")
            
            subprocess.run(
                ["docker", "push", registry_image],
                check=True
            )
            
            print(f"\n✅ Image pushed successfully: {registry_image}")
            return registry_image
            
        except subprocess.CalledProcessError as e:
            print(f"\n❌ Push failed: {e}")
            raise
    
    def create_serverless_endpoint(
        self,
        name: str,
        image: str,
        gpu_type: str = "NVIDIA A100 80GB",
        max_workers: int = 1
    ) -> Dict[str, Any]:
        """
        Create a Runpod Serverless endpoint.
        
        Args:
            name: Endpoint name
            image: Docker image (with registry path)
            gpu_type: GPU type to use
            max_workers: Maximum number of workers
            
        Returns:
            Endpoint information
        """
        print("\n" + "=" * 60)
        print("Creating Runpod Serverless Endpoint")
        print("=" * 60)
        
        mutation = """
        mutation CreateServerlessEndpoint($input: ServerlessEndpointInput!) {
            createServerlessEndpoint(input: $input) {
                id
                name
                gpuIds
                networkVolumeId
                locations
                idleTimeout
                scalerType
                scalerValue
                workersMin
                workersMax
                dockerImage
            }
        }
        """
        
        variables = {
            "input": {
                "name": name,
                "dockerImage": image,
                "gpuIds": gpu_type,
                "workersMin": 0,
                "workersMax": max_workers,
                "idleTimeout": 5,  # seconds
                "scalerType": "QUEUE_DELAY",
                "scalerValue": 4
            }
        }
        
        print(f"\n🚀 Creating endpoint: {name}")
        print(f"   Image: {image}")
        print(f"   GPU: {gpu_type}")
        print(f"   Max Workers: {max_workers}")
        print()
        
        try:
            data = self._graphql_request(mutation, variables)
            endpoint = data.get("createServerlessEndpoint", {})
            
            if not endpoint:
                raise Exception("Failed to create endpoint - no data returned")
            
            endpoint_id = endpoint.get("id")
            
            print(f"\n✅ Endpoint created successfully!")
            print(f"   ID: {endpoint_id}")
            print(f"   Name: {endpoint.get('name')}")
            print()
            
            return endpoint
            
        except Exception as e:
            print(f"\n❌ Failed to create endpoint: {e}")
            raise
    
    def get_endpoint_url(self, endpoint_id: str) -> str:
        """
        Get the HTTP URL for a serverless endpoint.
        
        Args:
            endpoint_id: Endpoint ID
            
        Returns:
            Endpoint URL
        """
        return f"https://api.runpod.ai/v2/{endpoint_id}"
    
    def validate_endpoint(self, endpoint_url: str, max_retries: int = 10) -> bool:
        """
        Validate that the endpoint is responding.
        
        Args:
            endpoint_url: Endpoint URL
            max_retries: Maximum number of retry attempts
            
        Returns:
            True if endpoint is healthy
        """
        print("\n" + "=" * 60)
        print("Validating Endpoint")
        print("=" * 60)
        
        health_url = f"{endpoint_url}/healthz"
        
        print(f"\n🔍 Checking health endpoint: {health_url}")
        print(f"   (This may take a few minutes for cold start)")
        print()
        
        for attempt in range(1, max_retries + 1):
            try:
                print(f"Attempt {attempt}/{max_retries}...", end=" ")
                
                response = requests.get(health_url, timeout=30)
                
                if response.status_code == 200:
                    print("✅ Healthy!")
                    print(f"\nResponse: {response.json()}")
                    return True
                else:
                    print(f"❌ Status {response.status_code}")
                    
            except requests.exceptions.RequestException as e:
                print(f"❌ {type(e).__name__}")
            
            if attempt < max_retries:
                wait_time = min(30, attempt * 5)
                print(f"   Waiting {wait_time}s before retry...")
                time.sleep(wait_time)
        
        print(f"\n⚠️  Endpoint did not become healthy after {max_retries} attempts")
        print("   This might be normal for cold start. Try again in a few minutes.")
        return False
    
    def deploy(
        self,
        endpoint_name: str = "svi-serverless",
        build_image: bool = True,
        push_image: bool = False
    ) -> Dict[str, Any]:
        """
        Complete deployment workflow.
        
        Args:
            endpoint_name: Name for the endpoint
            build_image: Whether to build Docker image
            push_image: Whether to push to registry
            
        Returns:
            Deployment information
        """
        print("\n" + "=" * 60)
        print("SVI Deployment to Runpod Serverless")
        print("=" * 60)
        print()
        
        image_name = "svi-serverless:latest"
        
        if build_image:
            image_name = self.build_docker_image()
        
        registry_image = image_name
        if push_image:
            registry_image = self.push_to_registry(image_name)
        
        endpoint_id = os.getenv("RUNPOD_ENDPOINT_ID")
        
        if endpoint_id:
            print(f"\n📌 Using existing endpoint: {endpoint_id}")
            endpoint_url = self.get_endpoint_url(endpoint_id)
        else:
            print("\n⚠️  No RUNPOD_ENDPOINT_ID found.")
            print("   Creating a new endpoint requires the image to be in a registry.")
            print("   Please set DOCKER_USERNAME and re-run with --push flag.")
            print()
            print("   Alternatively, manually create an endpoint at:")
            print("   https://www.runpod.io/console/serverless")
            print(f"   Using image: {registry_image}")
            return {
                "status": "pending",
                "image": registry_image,
                "message": "Manual endpoint creation required"
            }
        
        endpoint_url = self.get_endpoint_url(endpoint_id)
        is_healthy = self.validate_endpoint(endpoint_url)
        
        result = {
            "status": "deployed" if is_healthy else "pending",
            "endpoint_id": endpoint_id,
            "endpoint_url": endpoint_url,
            "image": registry_image,
            "health_check": is_healthy
        }
        
        print("\n" + "=" * 60)
        print("Deployment Summary")
        print("=" * 60)
        print()
        print(f"Status: {result['status']}")
        print(f"Endpoint ID: {result['endpoint_id']}")
        print(f"Endpoint URL: {result['endpoint_url']}")
        print(f"Image: {result['image']}")
        print()
        print("Add this to your .env file:")
        print(f"SVI_ENDPOINT_URL={result['endpoint_url']}")
        print()
        
        return result


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Deploy SVI to Runpod Serverless"
    )
    parser.add_argument(
        "--build-only",
        action="store_true",
        help="Only build the Docker image"
    )
    parser.add_argument(
        "--deploy-only",
        action="store_true",
        help="Only deploy (skip build)"
    )
    parser.add_argument(
        "--push",
        action="store_true",
        help="Push image to registry"
    )
    parser.add_argument(
        "--endpoint-name",
        default="svi-serverless",
        help="Name for the endpoint"
    )
    
    args = parser.parse_args()
    
    try:
        deployer = RunpodDeployer()
        
        if args.build_only:
            deployer.build_docker_image()
        elif args.deploy_only:
            deployer.deploy(
                endpoint_name=args.endpoint_name,
                build_image=False,
                push_image=args.push
            )
        else:
            deployer.deploy(
                endpoint_name=args.endpoint_name,
                build_image=True,
                push_image=args.push
            )
        
        print("\n✅ Deployment process completed!")
        
    except Exception as e:
        print(f"\n❌ Deployment failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
