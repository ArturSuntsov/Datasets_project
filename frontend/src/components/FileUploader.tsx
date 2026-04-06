/**
 * Компонент для загрузки файлов с прогресс-баром
 * Поддерживает drag-and-drop и polling статуса
 */

import React, { useState, useCallback, useEffect } from 'react';
import { dataLakeAPI, UploadStatusResponse } from '../services/api';
import { LoadingSpinner } from './LoadingSpinner';

interface FileUploaderProps {
  datasetId: string;
  onUploadComplete?: (fileInfo: { size: number; hash: string }) => void;
  onUploadError?: (error: string) => void;
  accept?: string;
  maxSizeMB?: number;
}

export function FileUploader({
  datasetId,
  onUploadComplete,
  onUploadError,
  accept = '.zip,.csv,.json,.parquet,.txt',
  maxSizeMB = 1024,
}: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  }, [pollingInterval]);

  const startPolling = useCallback(() => {
    stopPolling();
    
    const interval = setInterval(async () => {
      try {
        const uploadStatus = await dataLakeAPI.getUploadStatus(datasetId);
        
        setStatus(uploadStatus.status);
        setProgress(uploadStatus.progress || 0);
        
        if (uploadStatus.status === 'uploaded') {
          stopPolling();
          setUploading(false);
          onUploadComplete?.({
            size: uploadStatus.file_size_bytes || 0,
            hash: uploadStatus.file_hash || '',
          });
        } else if (uploadStatus.status === 'failed') {
          stopPolling();
          setUploading(false);
          onUploadError?.('Upload failed. Please try again.');
        }
      } catch (error) {
        console.error('Failed to get upload status:', error);
        stopPolling();
        setUploading(false);
        onUploadError?.('Failed to check upload status');
      }
    }, 2000); // Проверяем каждые 2 секунды
    
    setPollingInterval(interval);
  }, [datasetId, stopPolling, onUploadComplete, onUploadError]);

  const uploadFile = async (file: File) => {
    // Валидация размера
    if (file.size > maxSizeMB * 1024 * 1024) {
      onUploadError?.(`File too large. Max size: ${maxSizeMB}MB`);
      return;
    }

    setUploading(true);
    setProgress(0);
    setStatus('uploading');

    try {
      const response = await dataLakeAPI.uploadFile(datasetId, file);
      console.log('Upload started:', response);
      startPolling();
    } catch (error: any) {
      console.error('Upload failed:', error);
      setUploading(false);
      onUploadError?.(error.response?.data?.detail || 'Upload failed');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      uploadFile(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadFile(files[0]);
    }
  };

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  return (
    <div className="space-y-4">
      {/* Drag-and-Drop зона */}
      {!uploading && (
        <div
          className={`
            border-2 border-dashed rounded-xl p-8 text-center transition-all
            ${isDragging 
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' 
              : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
            }
          `}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center gap-3">
            <svg className="w-12 h-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Перетащите файл сюда или
              </p>
              <label className="mt-2 inline-block">
                <input
                  type="file"
                  accept={accept}
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <span className="cursor-pointer text-sm text-primary-600 dark:text-primary-400 hover:underline">
                  выберите файл
                </span>
              </label>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Поддерживаемые форматы: {accept.split(',').join(', ')}<br />
              Максимальный размер: {maxSizeMB} MB
            </p>
          </div>
        </div>
      )}

      {/* Прогресс загрузки */}
      {uploading && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LoadingSpinner size="sm" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Загрузка...
              </span>
            </div>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {progress}%
            </span>
          </div>
          
          {/* Progress bar */}
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
            <div
              className="bg-primary-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            {status === 'uploading' && 'Файл загружается на сервер...'}
            {status === 'uploaded' && '✅ Загрузка завершена!'}
            {status === 'failed' && '❌ Ошибка загрузки'}
          </p>
        </div>
      )}
    </div>
  );
}
