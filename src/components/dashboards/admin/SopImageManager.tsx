import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, Trash2, Check, Loader2, ImageIcon, GripVertical } from 'lucide-react';
import { toast } from '@/components/ui/sonner';

/**
 * SopImageManager — gallery + upload + reorder for screenshots attached
 * to a training_courses row.
 *
 * Used in two places:
 *   1. TrainingTab course modal (admin-only): full editor — upload / caption / reorder / delete
 *   2. DocumentationTab drill-down (read-only): gallery preview of images below markdown
 *
 * Hormozi: a screenshot with a red arrow is worth 500 words of SOP text.
 * This is the infrastructure that makes those 500-word shortcuts possible.
 */

interface SopImage {
  id: string;
  course_id: string;
  storage_path: string;
  public_url: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
}

interface Props {
  courseId: string;
  canEdit?: boolean;       // true = show upload + delete + reorder; false = gallery only
  compact?: boolean;       // tighter spacing for drill-down view
}

const SopImageManager: React.FC<Props> = ({ courseId, canEdit = false, compact = false }) => {
  const [images, setImages] = useState<SopImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingCaption, setEditingCaption] = useState<string | null>(null);
  const [captionDraft, setCaptionDraft] = useState('');
  const [lightbox, setLightbox] = useState<SopImage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data } = await supabase
      .from('sop_images' as any)
      .select('*')
      .eq('course_id', courseId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    setImages(((data as any) || []) as SopImage[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [courseId]);

  const handleUpload = async (file: File) => {
    if (!file || !file.type.startsWith('image/')) {
      toast.error('Only image files (PNG, JPG, GIF, WebP)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image too large — max 5 MB');
      return;
    }
    setUploading(true);
    try {
      // Generate a unique storage key under the course's folder
      const ext = file.name.split('.').pop() || 'png';
      const uuid = crypto.randomUUID();
      const storagePath = `${courseId}/${uuid}.${ext}`;

      // Upload to Supabase Storage
      const { error: upErr } = await supabase.storage
        .from('sop-images')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type,
        });
      if (upErr) throw upErr;

      // Public URL
      const { data: urlData } = supabase.storage.from('sop-images').getPublicUrl(storagePath);
      const publicUrl = urlData.publicUrl;

      // Row in sop_images
      const nextSort = images.length > 0 ? Math.max(...images.map(i => i.sort_order)) + 1 : 0;
      const { error: insErr } = await supabase.from('sop_images' as any).insert({
        course_id: courseId,
        storage_path: storagePath,
        public_url: publicUrl,
        caption: '',
        sort_order: nextSort,
      });
      if (insErr) throw insErr;

      toast.success('Screenshot uploaded');
      await load();
    } catch (e: any) {
      toast.error(`Upload failed: ${e.message || e}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveCaption = async (imgId: string) => {
    const { error } = await supabase
      .from('sop_images' as any)
      .update({ caption: captionDraft.trim(), updated_at: new Date().toISOString() })
      .eq('id', imgId);
    if (error) { toast.error(error.message); return; }
    setEditingCaption(null);
    setCaptionDraft('');
    load();
  };

  const handleDelete = async (img: SopImage) => {
    if (!window.confirm('Delete this screenshot? This cannot be undone.')) return;
    try {
      await supabase.storage.from('sop-images').remove([img.storage_path]);
      const { error } = await supabase.from('sop_images' as any).delete().eq('id', img.id);
      if (error) throw error;
      toast.success('Screenshot deleted');
      load();
    } catch (e: any) {
      toast.error(`Delete failed: ${e.message || e}`);
    }
  };

  const move = async (img: SopImage, direction: -1 | 1) => {
    const idx = images.findIndex(i => i.id === img.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= images.length) return;
    const other = images[swapIdx];
    // Swap sort_orders
    await Promise.all([
      supabase.from('sop_images' as any).update({ sort_order: other.sort_order }).eq('id', img.id),
      supabase.from('sop_images' as any).update({ sort_order: img.sort_order }).eq('id', other.id),
    ]);
    load();
  };

  if (loading) {
    return <div className="flex justify-center p-4"><Loader2 className="h-4 w-4 animate-spin text-gray-400" /></div>;
  }

  // Read-only gallery (no admin controls)
  if (!canEdit) {
    if (images.length === 0) return null;
    return (
      <div className={compact ? 'my-3' : 'my-4'}>
        <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">
          {images.length} screenshot{images.length === 1 ? '' : 's'}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {images.map(img => (
            <figure key={img.id} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => setLightbox(img)}
                className="block w-full bg-gray-50 hover:bg-gray-100 transition"
              >
                <img
                  src={img.public_url}
                  alt={img.caption || 'SOP screenshot'}
                  className="w-full h-auto max-h-64 object-contain"
                  loading="lazy"
                />
              </button>
              {img.caption && (
                <figcaption className="text-xs text-gray-700 px-3 py-2 border-t border-gray-100 leading-relaxed">
                  {img.caption}
                </figcaption>
              )}
            </figure>
          ))}
        </div>

        {lightbox && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
            <img src={lightbox.public_url} alt={lightbox.caption || ''} className="max-h-[90vh] max-w-[90vw] object-contain" />
          </div>
        )}
      </div>
    );
  }

  // Admin editor
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
          Screenshots <span className="normal-case text-gray-400 ml-1">· drag-order, click caption to edit, max 5 MB</span>
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="text-xs"
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
          {uploading ? 'Uploading…' : 'Add screenshot'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
          }}
          className="hidden"
        />
      </div>

      {images.length === 0 ? (
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-6 text-center">
          <ImageIcon className="h-8 w-8 text-gray-300 mx-auto mb-1" />
          <p className="text-sm text-gray-500">No screenshots yet</p>
          <p className="text-xs text-gray-400 mt-0.5">Drag a red arrow on top in Snagit / CloudApp, then upload.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {images.map((img, i) => (
            <div key={img.id} className="flex items-start gap-2 border border-gray-200 rounded-lg p-2 bg-white">
              <div className="flex flex-col items-center gap-0.5 pt-1">
                <button type="button" onClick={() => move(img, -1)} disabled={i === 0} className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30 px-1">▲</button>
                <GripVertical className="h-3 w-3 text-gray-300" />
                <button type="button" onClick={() => move(img, 1)} disabled={i === images.length - 1} className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30 px-1">▼</button>
              </div>
              <img
                src={img.public_url}
                alt={img.caption || 'SOP screenshot'}
                className="w-28 h-20 object-contain bg-gray-50 border border-gray-200 rounded cursor-pointer flex-shrink-0"
                onClick={() => setLightbox(img)}
              />
              <div className="flex-1 min-w-0">
                {editingCaption === img.id ? (
                  <div className="flex gap-2">
                    <Input
                      value={captionDraft}
                      onChange={e => setCaptionDraft(e.target.value)}
                      placeholder="Caption (e.g. Fig 1 — Click New Appointment)"
                      className="h-8 text-xs"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleSaveCaption(img.id);
                        if (e.key === 'Escape') { setEditingCaption(null); setCaptionDraft(''); }
                      }}
                    />
                    <Button type="button" size="sm" onClick={() => handleSaveCaption(img.id)} className="h-8"><Check className="h-3 w-3" /></Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setEditingCaption(img.id); setCaptionDraft(img.caption || ''); }}
                    className="text-left w-full text-xs text-gray-700 hover:text-gray-900 py-1 cursor-text"
                  >
                    {img.caption || <span className="italic text-gray-400">(no caption — click to add)</span>}
                  </button>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(img)}
                className="text-gray-400 hover:text-red-600 h-8 w-8 p-0 flex-shrink-0"
                title="Delete screenshot"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox.public_url} alt={lightbox.caption || ''} className="max-h-[90vh] max-w-[90vw] object-contain" />
        </div>
      )}
    </div>
  );
};

export default SopImageManager;
