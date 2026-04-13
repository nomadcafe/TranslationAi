"use client"

import { apiFetch } from '@/lib/api-fetch'

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface TaskResponse {
  Response: {
    Data: {
      TaskId: number;
    };
    RequestId: string;
  };
}

interface StatusResponse {
  Response: {
    Data: {
      Status: number;
      Result: string;
    };
    RequestId: string;
  };
}

export class TencentASRService {
  private taskQueue: Array<() => Promise<void>> = [];
  private isProcessing: boolean = false;

  private async processQueue() {
    if (this.isProcessing || this.taskQueue.length === 0) return;

    this.isProcessing = true;
    try {
      const task = this.taskQueue.shift();
      if (task) {
        await task();
      }
    } finally {
      this.isProcessing = false;
      if (this.taskQueue.length > 0) {
        await this.processQueue();
      }
    }
  }

  private addToQueue(task: () => Promise<void>) {
    this.taskQueue.push(task);
    this.processQueue();
  }

  private async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const arrayBuffer = reader.result as ArrayBuffer;
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  // Strip subtitle-style timestamps from ASR text.
  private cleanTimestamps(text: string): string {
    // Remove patterns like [0:1.740,0:3.480]
    return text.replace(/\[\d+:\d+\.\d+,\d+:\d+\.\d+\]\s*/g, '');
  }

  async recognizeAudio(
    file: File,
    onProgress: (text: string) => void,
    onError: (error: string) => void
  ): Promise<string> {
    try {
      const base64Data = await this.fileToBase64(file);
      
      return new Promise((resolve, reject) => {
        this.addToQueue(async () => {
          try {
            // Create async recognition job.
            const createResponse = await apiFetch('/api/asr/create', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                engineType: '16k_zh',
                channelNum: 1,
                resTextFormat: 0,
                sourceType: 1,
                data: base64Data,
              }),
            });

            if (!createResponse.ok) {
              const errorData = await createResponse.json();
              throw new Error(errorData.error || '创建识别任务失败');
            }

            const createData: TaskResponse = await createResponse.json();
            const taskId = createData.Response.Data.TaskId;

            // Poll job status until terminal state.
            const checkStatus = async () => {
              const statusResponse = await apiFetch('/api/asr/status', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  taskId,
                }),
              });

              if (!statusResponse.ok) {
                const errorData = await statusResponse.json();
                throw new Error(errorData.error || '查询任务状态失败');
              }

              const statusData: StatusResponse = await statusResponse.json();
              const status = statusData.Response.Data.Status;
              let resultText = statusData.Response.Data.Result;

              // Strip timestamps from partial/final text.
              if (resultText) {
                resultText = this.cleanTimestamps(resultText);
              }

              if (status === 2) { // Success
                resolve(resultText);
              } else if (status === 3) { // Failed
                reject(new Error("识别失败"));
              } else { // Running
                if (resultText) {
                  onProgress(resultText);
                }
                setTimeout(checkStatus, 1000);
              }
            };

            await checkStatus();
          } catch (error: any) {
            reject(error);
          }
        });
      });
    } catch (error: any) {
      onError(error.message || "音频识别失败");
      throw error;
    }
  }

  async recognizeStream(
    onResult: (text: string, isFinal: boolean) => void,
    onError: (error: string) => void
  ) {
    // Live dictation via the browser SpeechRecognition API.
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onError('浏览器不支持语音识别');
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'zh-CN';

    recognition.onresult = (event: any) => {
      const result = event.results[event.results.length - 1];
      const text = result[0].transcript;
      onResult(text, result.isFinal);
    };

    recognition.onerror = (event: any) => {
      onError(`语音识别错误: ${event.error}`);
    };

    return recognition;
  }
} 