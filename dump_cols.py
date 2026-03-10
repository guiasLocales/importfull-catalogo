from database import SessionLocal
from sqlalchemy import text

db = SessionLocal()
try:
    result = db.execute(text("DESCRIBE mercadolibre.scrapped_competence"))
    with open("cols.txt", "w") as f:
        for row in result:
            f.write(f"{row[0]}\n")
    print("Done writing cols.txt")
except Exception as e:
    print(f"Error: {e}")
finally:
    db.close()
