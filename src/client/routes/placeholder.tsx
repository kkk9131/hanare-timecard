type PlaceholderProps = {
  screenId: string;
  title: string;
};

export function Placeholder({ screenId, title }: PlaceholderProps) {
  return (
    <div
      data-screen={screenId}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        fontFamily: "serif",
        fontSize: "24px",
      }}
    >
      <span>
        [{screenId}] {title}
      </span>
    </div>
  );
}
