import { ActionIcon, Box, Button, FileButton, Group, Image, Modal, SimpleGrid, Stack, Text, type ImageProps } from '@mantine/core';
import { IconCamera, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getToken, post } from '../lib/api';
import { useNames } from '../lib/catalog';
import { fmtDateTime } from '../lib/format';
import type { Photo } from '../lib/types';

export type PendingPhoto = { data: string; mime: 'image/jpeg'; preview: string };

/** Shrinks a camera photo to max 1600 px (JPEG) so uploads stay small on the factory network. */
export async function shrinkPhoto(file: File, max = 1600): Promise<PendingPhoto> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new window.Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    return { data: dataUrl.split(',')[1], mime: 'image/jpeg', preview: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadPhotos(unitId: number, photos: PendingPhoto[], link: { ticketId?: number | null; testId?: number | null }) {
  for (const p of photos) await post(`/api/units/${unitId}/photos`, { data: p.data, mime: p.mime, ...link });
}

/** Take or choose photos. On a PC with a webcam / phone camera the file dialog offers the camera. */
export function PhotoPicker({ value, onChange }: { value: PendingPhoto[]; onChange: (v: PendingPhoto[]) => void }) {
  const { t } = useTranslation();
  return (
    <Stack gap="xs">
      <FileButton
        accept="image/*"
        multiple
        onChange={async (files) => {
          const shrunk = await Promise.all((files ?? []).slice(0, 6).map((f) => shrinkPhoto(f)));
          onChange([...value, ...shrunk].slice(0, 6));
        }}
      >
        {(props) => (
          <Button {...props} variant="light" leftSection={<IconCamera />}>
            {t('photos.add')}
          </Button>
        )}
      </FileButton>
      {value.length > 0 && (
        <Group gap="xs">
          {value.map((p, i) => (
            <Box key={i} pos="relative">
              <Image src={p.preview} w={88} h={88} radius="sm" fit="cover" />
              <ActionIcon size="sm" color="red" pos="absolute" top={2} right={2} onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="remove">
                <IconX size={14} />
              </ActionIcon>
            </Box>
          ))}
        </Group>
      )}
    </Stack>
  );
}

/** Photos need the sign-in token, so they are fetched and shown as local blobs. */
export function AuthImage({ id, ...rest }: { id: number } & ImageProps) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let alive = true;
    fetch(`/api/photos/${id}`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (b && alive) setSrc((url = URL.createObjectURL(b)));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  return <Image src={src} fallbackSrc="data:image/gif;base64,R0lGODlhAQABAAAAACw=" {...rest} />;
}

export function PhotoGallery({ photos }: { photos: Photo[] }) {
  const { t } = useTranslation();
  const n = useNames();
  const [open, setOpen] = useState<Photo | null>(null);
  if (!photos.length) return <Text c="dimmed" size="sm">{t('photos.none')}</Text>;
  return (
    <>
      <SimpleGrid cols={{ base: 3, sm: 4, md: 6 }} spacing="xs">
        {photos.map((p) => (
          <Box key={p.id} style={{ cursor: 'zoom-in' }} onClick={() => setOpen(p)}>
            <AuthImage id={p.id} h={100} radius="sm" fit="cover" />
          </Box>
        ))}
      </SimpleGrid>
      <Modal opened={!!open} onClose={() => setOpen(null)} size="xl" centered title={open ? `${n.user(open.uploadedBy)} · ${fmtDateTime(open.createdAt, n.lang)}` : ''}>
        {open && <AuthImage id={open.id} fit="contain" mah="75vh" />}
        {open?.caption && <Text mt="xs">{open.caption}</Text>}
      </Modal>
    </>
  );
}
