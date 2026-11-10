export function LockedNotice({ onCopy }: { onCopy: () => void }) {
  return (
    <p className="notice" role="note">
      Bu gece tamamlandı; sonucu korumak için ayarlar kilitli.{' '}
      <button type="button" className="btn-text" onClick={onCopy}>
        Kopyasını oluştur ve düzenle
      </button>
    </p>
  );
}

export function ResetNotice() {
  return (
    <p className="notice" role="note">
      Bu gecenin provası devam ediyor. Buradaki bir değişiklik provadaki kararları sıfırlar (önce onay istenir).
    </p>
  );
}
