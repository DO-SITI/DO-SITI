import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Coffee, Cookie } from 'lucide-react';
import type { MenuCategory } from '../types';

interface MenuImageProps {
  src: string;
  alt: string;
  category?: MenuCategory;
  className?: string;
}

const loadedUrlCache = new Set<string>();
const failedUrlCache = new Set<string>();

export function MenuImage({
  src,
  alt,
  category = 'Donat',
  className = '',
}: MenuImageProps) {
  const cleanSrc = (src || '').trim();
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [hasError, setHasError] = useState<boolean>(() =>
    cleanSrc ? failedUrlCache.has(cleanSrc) : true,
  );
  const [isLoaded, setIsLoaded] = useState<boolean>(() =>
    cleanSrc ? loadedUrlCache.has(cleanSrc) : false,
  );

  useLayoutEffect(() => {
    if (!cleanSrc) {
      setHasError(true);
      setIsLoaded(false);
      return;
    }

    if (failedUrlCache.has(cleanSrc)) {
      setHasError(true);
      setIsLoaded(false);
      return;
    }

    setHasError(false);

    const imgEl = imgRef.current;
    if (imgEl && imgEl.complete) {
      if (imgEl.naturalWidth > 0) {
        loadedUrlCache.add(cleanSrc);
        setIsLoaded(true);
        return;
      }
    }

    setIsLoaded(loadedUrlCache.has(cleanSrc));
  }, [cleanSrc]);

  useEffect(() => {
    if (!cleanSrc || hasError || isLoaded) return;

    // Timeout safety net if an external image hangs indefinitely
    const timeoutId = window.setTimeout(() => {
      const imgEl = imgRef.current;
      if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
        loadedUrlCache.add(cleanSrc);
        setIsLoaded(true);
      } else if (!loadedUrlCache.has(cleanSrc)) {
        setHasError(true);
      }
    }, 10000);

    return () => window.clearTimeout(timeoutId);
  }, [cleanSrc, hasError, isLoaded]);

  if (!cleanSrc || hasError) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#2B232F] via-[#362B3B] to-[#231A24] text-[#E7A1B7] p-4 text-center ${className}`}
      >
        <div className="w-12 h-12 rounded-2xl bg-[#FAF4F6]/10 border border-[#E7A1B7]/25 flex items-center justify-center mb-2">
          {category === 'Minuman' ? (
            <Coffee className="w-6 h-6 text-[#E7A1B7]" strokeWidth={1.7} />
          ) : (
            <Cookie className="w-6 h-6 text-[#E7A1B7]" strokeWidth={1.7} />
          )}
        </div>
        <span className="text-xs font-medium text-[#FAF4F6]/90 line-clamp-2 max-w-[180px]">
          {alt}
        </span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-[#2B232F]">
      {!isLoaded && (
        <div
          aria-hidden="true"
          className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#2B232F] via-[#362B3B] to-[#231A24] text-[#E7A1B7]/70 animate-pulse"
        >
          {category === 'Minuman' ? (
            <Coffee className="w-6 h-6 mb-1.5 opacity-60" strokeWidth={1.6} />
          ) : (
            <Cookie className="w-6 h-6 mb-1.5 opacity-60" strokeWidth={1.6} />
          )}
        </div>
      )}
      <img
        ref={imgRef}
        src={cleanSrc}
        alt={alt}
        loading="eager"
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => {
          loadedUrlCache.add(cleanSrc);
          failedUrlCache.delete(cleanSrc);
          setHasError(false);
          setIsLoaded(true);
        }}
        onError={() => {
          failedUrlCache.add(cleanSrc);
          setHasError(true);
        }}
        className={`relative z-10 ${className}`}
      />
    </div>
  );
}
