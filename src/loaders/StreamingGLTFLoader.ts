import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import * as THREE from 'three';
import { isLowMemoryDevice } from '../runtime/mobileProfile';

export interface LoadProgress {
  loaded: number;
  total: number;
  url: string;
}

export interface StreamingLoaderConfig {
  maxConcurrent?: number;
  delayBetweenLoads?: number;
  onProgress?: (progress: LoadProgress) => void;
  onModelLoaded?: (url: string, gltf: any) => void;
  onError?: (url: string, error: any) => void;
  renderer?: THREE.WebGLRenderer;
}

export class StreamingGLTFLoader {
  private loader: GLTFLoader;
  private queue: string[] = [];
  private inFlight: number = 0;
  private maxConcurrent: number;
  private delayBetweenLoads: number;
  private config: StreamingLoaderConfig;
  private loadedModels: Set<string> = new Set();

  constructor(config: StreamingLoaderConfig = {}) {
    this.config = config;
    this.maxConcurrent = config.maxConcurrent ?? (isLowMemoryDevice() ? 2 : 4);
    this.delayBetweenLoads = config.delayBetweenLoads ?? (isLowMemoryDevice() ? 250 : 100);
    
    this.loader = new GLTFLoader();
    
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/draco/');
    this.loader.setDRACOLoader(dracoLoader);
    
    if (config.renderer) {
      const ktx2Loader = new KTX2Loader();
      ktx2Loader.setTranscoderPath('/basis/');
      ktx2Loader.detectSupport(config.renderer);
      this.loader.setKTX2Loader(ktx2Loader);
    }
    
    console.log(`📦 StreamingGLTFLoader initialized (maxConcurrent: ${this.maxConcurrent}, delay: ${this.delayBetweenLoads}ms)`);
  }

  loadModels(urls: string[]): Promise<void> {
    this.queue = [...urls];
    console.log(`📦 Queued ${urls.length} models for streaming load`);
    
    return new Promise((resolve) => {
      const checkComplete = () => {
        if (this.queue.length === 0 && this.inFlight === 0) {
          console.log(`✅ All models loaded (${this.loadedModels.size} total)`);
          resolve();
        }
      };
      
      const processNext = () => {
        if (this.inFlight >= this.maxConcurrent || this.queue.length === 0) {
          checkComplete();
          return;
        }
        
        this.inFlight++;
        const url = this.queue.shift()!;
        
        // Check memory before loading on mobile
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobile && (window.performance as any).memory) {
          const memInfo = (window.performance as any).memory;
          const memoryUsage = memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit;
          if (memoryUsage > 0.6) {
            console.warn(`⚠️ Memory usage high (${(memoryUsage * 100).toFixed(1)}%), skipping model: ${url}`);
            this.inFlight--;
            setTimeout(() => processNext(), this.delayBetweenLoads);
            return;
          }
        }
        
        this.loader.load(
          url,
          (gltf) => {
            this.loadedModels.add(url);
            this.inFlight--;
            
            if (this.config.onModelLoaded) {
              this.config.onModelLoaded(url, gltf);
            }
            
            setTimeout(() => processNext(), this.delayBetweenLoads);
          },
          (progress) => {
            if (this.config.onProgress) {
              this.config.onProgress({
                loaded: progress.loaded,
                total: progress.total,
                url
              });
            }
          },
          (error) => {
            console.warn(`❌ Failed to load model: ${url}`, error);
            this.inFlight--;
            
            if (this.config.onError) {
              this.config.onError(url, error);
            }
            
            setTimeout(() => processNext(), this.delayBetweenLoads);
          }
        );
        
        if (this.inFlight < this.maxConcurrent && this.queue.length > 0) {
          setTimeout(() => processNext(), 50);
        }
      };
      
      for (let i = 0; i < this.maxConcurrent && i < urls.length; i++) {
        processNext();
      }
    });
  }

  async loadSingle(url: string): Promise<any> {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile && (window.performance as any).memory) {
      const memInfo = (window.performance as any).memory;
      const memoryUsage = memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit;
      if (memoryUsage > 0.6) {
        throw new Error(`Memory usage too high (${(memoryUsage * 100).toFixed(1)}%) to load: ${url}`);
      }
    }
    
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          this.loadedModels.add(url);
          resolve(gltf);
        },
        undefined,
        (error) => {
          console.warn(`❌ Failed to load model: ${url}`, error);
          reject(error);
        }
      );
    });
  }

  getLoadedCount(): number {
    return this.loadedModels.size;
  }

  isLoading(): boolean {
    return this.inFlight > 0 || this.queue.length > 0;
  }

  clearQueue(): void {
    this.queue = [];
    console.log('🗑️ StreamingGLTFLoader queue cleared');
  }
}
