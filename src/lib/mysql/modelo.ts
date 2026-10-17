/**
 * GENERADO por `scripts/mysql/generar-esquema.mts` desde el Postgres de producción.
 * No se edita a mano.
 *
 * Lo que la capa compatible (`src/lib/mysql/postgrest/`) necesita saber de cada
 * tabla para hacer lo que hace PostgREST: los tipos (para devolver lo mismo),
 * las llaves (para `onConflict` y los mensajes de error), las relaciones (para
 * `providers(name)` dentro de un `select`) y las políticas RLS, ya traducidas a
 * MariaDB. Las funciones que nombran (`is_admin()`, `manages_provider()`…)
 * están en `mysql/logica.sql`.
 */

export type TipoColumna = "uuid" | "texto" | "entero" | "decimal" | "booleano" | "fecha" | "instante" | "json" | "enum";

export interface Columna {
  tipo: TipoColumna;
  nula: boolean;
  generada?: boolean;
  /** `default auth.uid()` en Postgres: lo pone la capa al insertar. */
  defectoUsuario?: boolean;
  /** `default gen_random_uuid()`: si no viene, la capa pone uno. */
  uuidPorDefecto?: boolean;
  autoincremental?: boolean;
}

export interface Tabla {
  vista: boolean;
  /** Con RLS y sin una política que lo permita, Postgres niega: aquí también. */
  rls: boolean;
  columnas: Record<string, Columna>;
  pk: string[];
  unicas: Record<string, string[]>;
  fks: { nombre: string; columnas: string[]; tabla: string; referencias: string[] }[];
}

export interface Politica {
  nombre: string;
  orden: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "ALL";
  usando: string | null;
  comprobando: string | null;
}

export const TABLAS: Record<string, Tabla> = {
  "campanas": {
    "vista": false,
    "rls": true,
    "columnas": {
      "id": {
        "tipo": "uuid",
        "nula": false
      },
      "tipo": {
        "tipo": "texto",
        "nula": false
      },
      "asunto": {
        "tipo": "texto",
        "nula": false
      },
      "cuerpo": {
        "tipo": "texto",
        "nula": false
      },
      "creada_por": {
        "tipo": "uuid",
        "nula": true,
        "defectoUsuario": true
      },
      "created_at": {
        "tipo": "instante",
        "nula": false
      }
    },
    "pk": [
      "id"
    ],
    "unicas": {},
    "fks": [
      {
        "nombre": "campanas_creada_por_fkey",
        "columnas": [
          "creada_por"
        ],
        "tabla": "usuarios",
        "referencias": [
          "id"
        ]
      }
    ]
  },
  "certifications": {
    "vista": false,
    "rls": true,
    "columnas": {
      "code": {
        "tipo": "texto",
        "nula": false
      },
      "label": {
        "tipo": "texto",
        "nula": false
      },
      "issuer": {
        "tipo": "texto",
        "nula": false
      },
      "points": {
        "tipo": "entero",
        "nula": false
      }
    },
    "pk": [
      "code"
    ],
    "unicas": {},
    "fks": []
  },
  "community_post_log": {
    "vista": false,
    "rls": true,
    "columnas": {
      "author_id": {
        "tipo": "uuid",
        "nula": false
      },
      "created_at": {
        "tipo": "instante",
        "nula": false
      }
    },
    "pk": [],
    "unicas": {},
    "fks": [
      {
        "nombre": "community_post_log_author_id_fkey",
        "columnas": [
          "author_id"
        ],
        "tabla": "usuarios",
        "referencias": [
          "id"
        ]
      }
    ]
  },
  "community_posts": {
    "vista": false,
    "rls": true,
    "columnas": {
      "id": {
        "tipo": "uuid",
        "nula": false,
        "uuidPorDefecto": true
      },
      "author_id": {
        "tipo": "uuid",
        "nula": false
      },
      "author_name": {
        "tipo": "texto",
        "nula": false
      },
      "provider_id": {
        "tipo": "uuid",
        "nula": true
      },
      "title": {
        "tipo": "texto",
        "nula": false
      },
      "body": {
        "tipo": "texto",
        "nula": false
      },
      "topic": {
        "tipo": "texto",
        "nula": false
      },
      "status": {
        "tipo": "enum",
        "nula": false
      },
      "featured": {
        "tipo": "booleano",
        "nula": false
      },
      "reaction_count": {
        "tipo": "entero",
        "nula": false
      },
      "created_at": {
        "tipo": "instante",
        "nula": false
      },
      "reaction_counts": {
        "tipo": "json",
        "nula": false
      },
      "edited_at": {
        "tipo": "instante",
        "nula": true
      }
    },
    "pk": [
      "id"
    ],
    "unicas": {},
    "fks": [
      {
        "nombre": "community_posts_author_id_fkey",
        "columnas": [
          "author_id"
        ],
        "tabla": "usuarios",
        "referencias": [
          "id"
        ]
      },
      {
        "nombre": "community_posts_provider_id_fkey",
        "columnas": [
          "provider_id"
        ],
        "tabla": "providers",
        "referencias": [
          "id"
        ]
      }
    ]
  },
  "community_reactions": {
    "vista": false,
    "rls": true,
    "columnas": {
      "post_id": {
        "tipo": "uuid",
        "nula": false
      },
      "user_id": {
        "tipo": "uuid",
        "nula": false
      },
      "created_at": {
        "tipo": "instante",
        "nula": false
      },
      "kind": {
        "tipo": "texto",
        "nula": false
      }
    },
    "pk": [
      "post_id",
      "user_id",
      "kind"
    ],
    "unicas": {},
    "fks": [
      {
        "nombre": "community_reactions_post_id_fkey",
        "columnas": [
          "post_id"
        ],
        "tabla": "community_posts",
        "referencias": [
          "id"
        ]
      },
      {
        "nombre": "community_reactions_user_id_fkey",
        "columnas": [
          "user_id"
        ],
        "tabla": "usuarios",
        "referencias": [
          "id"
        ]
      }
    ]
  },
  "envios_de_campana": {
    "vista": false,
    "rls": true,
    "columnas": {
      "campana_id": {
        "tipo": "uuid",
        "nula": false
      },
      "prospecto_id": {
        "tipo": "uuid",
        "nula": false
      },
      "estado": {
        "tipo": "texto",
        "nula": false
      },
      "error": {
        "tipo": "texto",
        "nula": true
      },
      "enviado_at": {
        "tipo": "instante",
        "nula": false
      }
    },
    "pk": [
      "campana_id",
      "prospecto_id"
    ],
    "unicas": {},
    "fks": [
      {
        "nombre": "envios_de_campana_campana_id_fkey",
        "columnas": [
          "campana_id"
        ],
        "tabla": "campanas",
        "referencias": [
          "id"
        ]
      },
      {
        "nombre": "envios_de_campana_prospecto_id_fkey",
        "columnas": [
          "prospecto_id"
        ],
        "tabla": "prospectos",
        "referencias": [
          "id"
        ]
      }
    ]
  },
  "experience_events": {
    "vista": false,
    "rls": true,
    "columnas": {
      "id": {
        "tipo": "uuid",
        "nula": false,
        "uuidPorDefecto": true
      },
      "provider_id": {
        "tipo": "uuid",
        "nula": false
      },
      "clave": {
        "tipo": "texto",
        "nula": false
      },
      "puntos": {
        "tipo": "entero",
        "nula": false
      },
      "referencia": {
        "tipo": "texto",
        "nula": true
      },
      "created_at": {
        "tipo": "instante",
        "nula": false
      }
    },
    "pk": [
      "id"
    ],
    "unicas": {
      "experience_events_unicos": [
        "provider_id",
        "clave",
        "referencia_clave"
      ]
    },
    "fks": [
      {
        "nombre": "experience_events_provider_id_fkey",
        "columnas": [
          "provider_id"
        ],
        "tabla": "providers",
        "referencias": [
          "id"
        ]
      }
    ]
  },
  "listing_availability": {
    "vista": false,
    "rls": true,
    "columnas": {
      "id": {
        "tipo": "uuid",
        "nula": false,
        "uuidPorDefecto": true
      },
      "listing_id": {
        "tipo": "uuid",
        "nula": false
      },
      "date": {
        "tipo": "fecha",
        "nula": false
      },
      "slots_total": {
        "tipo": "entero",
        "nula": false
      },
      "slots_taken": {
        "tipo": "entero",
        "nula": false
      }
    },
    "pk": [
      "id"
    ],
    "unicas": {
      "listing_availability_listing_id_date_key": [
        "listing_id",
        "date"
      ]
    },
    "fks": [
      {
        "nombre": "listing_availability_listing_id_fkey",
        "columnas": [
          "listing_id"
        ],
        "tabla": "listings",
        "referencias": [
          "id"
        ]
      }
    ]
  },
  "listings": {
    "vista": false,
    "rls": true,
    "columnas": {
      "id": {
        "tipo": "uuid",
        "nula": false,
        "uuidPorDefecto": true
      },
      "slug": {
        "tipo": "texto",
        "nula": false
      },
      "provider_id": {
        "tipo": "uuid",
        "nula": false
      },
      "kind": {
        "tipo": "enum",
        "nula": false
      },
      "title": {
        "tipo": "texto",
        "nula": false
      },
      "summary": {
        "tipo": "texto",
        "nula": false
      },
      "description": {
        "tipo": "texto",
        "nula": false
      },
      "category": {
        "tipo": "texto",
        "nula": false
      },
      "verticals": {
        "tipo": "json",
        "nula": false
      },
      "images": {
        "tipo": "json",
        "nula": false
      },
      "price_cop": {
        "tipo": "entero",
        "nula": false
      },
      "wholesale_price_cop": {
        "tipo": "entero",
        "nula": true
      },
      "wholesale_min_qty": {
        "tipo": "entero",
        "nula": true
      },
      "unit": {
        "tipo": "texto",
        "nula": false
      },
      "quote_only": {
        "tipo": "booleano",
        "nula": false
      },
      "stock": {
        "tipo": "entero",
        "nula": true
      },
      "co2_kg_saved": {
        "tipo": "decimal",
        "nula": true
      },
      "water_liters_saved": {
        "tipo": "decimal",
        "nula": true
      },
      "waste_kg_reduced": {
        "tipo": "decimal",
        "nula": true
      },
      "certifications": {
        "tipo": "json",
        "nula": false
      },
      "department": {
        "tipo": "texto",
        "nula": true
      },
      "city": {
        "tipo": "texto",
        "nula": true
      },
      "status": {
        "tipo": "enum",
        "nula": false
      },
      "featured": {
        "tipo": "booleano",
        "nula": false
      },
      "duration_hours": {
        "tipo": "entero",
        "nula": true
      },
      "min_people": {
        "tipo": "entero",
        "nula": true
      },
      "max_people": {
        "tipo": "entero",
        "nula": true
      },
      "meeting_point": {
        "tipo": "texto",
        "nula": true
      },
      "includes": {
        "tipo": "json",
        "nula": true
      },
      "delivery_time": {
        "tipo": "texto",
        "nula": true
      },
      "scope": {
        "tipo": "json",
        "nula": true
      },
      "created_at": {
        "tipo": "instante",
        "nula": false
      },
      "busqueda": {
        "tipo": "texto",
        "nula": true,
        "generada": true
      },
      "impacto": {
        "tipo": "decimal",
        "nula": true,
        "generada": true
      },
      "subcategory": {
        "tipo": "texto",
        "nula": true
      },
      "aporte_ambiental": {
        "tipo": "texto",
        "nula": true
      },
      "consecuencia_ambiental": {
        "tipo": "texto",
        "nula": true
      },
      "huella_co2_kg": {
        "tipo": "decimal",
        "nula": true
      },
      "despacho": {
        "tipo": "texto",
        "nula": true
      },
      "transportadora": {
        "tipo": "texto",
        "nula": true
      },
      "envio_cop": {
        "tipo": "entero",
        "nula": true
      },
      "entrega_dias_min": {
        "tipo": "entero",
        "nula": true
      },
      "entrega_dias_max": {
        "tipo": "entero",
        "nula": true
      },
      "version": {
        "tipo": "entero",
        "nula": false
      },
      "envio_local_cop": {
        "tipo": "entero",
        "nula": true
      },
      "envio_adicional_cop": {
        "tipo": "entero",
        "nula": true
      },
      "peso_kg": {
        "tipo": "decimal",
        "nula": true
      },
      "largo_cm": {
        "tipo": "entero",
        "nula": true
      },
      "ancho_cm": {
        "tipo": "entero",
        "nula": true
      },
      "alto_cm": {
        "tipo": "entero",
        "nula": true
      }
    },
    "pk": [
      "id"
    ],
    "unicas": {
      "listings_slug_key": [
        "slug"
      ]
    },
    "fks": [
      {
        "nombre": "listings_provider_id_fkey",
        "columnas": [
          "provider_id"
        ],
        "tabla": "providers",
        "referencias": [
          "id"
        ]
      }
    ]
  },
  "order_items": {
    "vista": false,
    "rls": true,
    "columnas": {
      "id": {
        "tipo": "uuid",
        "nula": false,
        "uuidPorDefecto": true
      },
      "order_id": {
        "tipo": "uuid",
        "nula": false
      },
      "listing_id": {
        "tipo": "uuid",
        "nula": true
      },
      "provider_id": {
        "tipo": "uuid",
        "nula": false
      },
      "title_snapshot": {
        "tipo": "texto",
        "nula": false
      },
      "unit_price_cop": {
        "tipo": "entero",
        "nula": false
      },
      "qty": {
        "tipo": "entero",
        "nula": false
      },
      "date": {
        "tipo": "fecha",
        "nula": true
      },
      "commission_cop": {
        "tipo": "entero",
        "nula": false
      },
      "created_at": {
        "tipo": "instante",
        "nula": false
      },
      "commission_rate": {
        "tipo": "decimal",
        "nula": true
      },
      "envio_cop": {
        "tipo": "entero",
        "nula": false
      },
      "despacho": {
        "tipo": "texto",
        "nula": true
      },
      "transportadora": {
        "tipo": "texto",
        "nula": true
      },
      "entrega_dias_min": {
        "tipo": "entero",
        "nula": true
      },
      "entrega_dias_max": {
        "tipo": "entero",
        "nula": true
      },
      "envio_estado": {
        "tipo": "texto",
        "nula": true
      },
      "guia": {
        "tipo": "texto",
        "nula": true
      },
      "despachado_at": {
        "tipo": "instante",
        "nula": true
      },
      "entregado_at": {
        "tipo": "instante",
        "nula": true
      },
      "stock_descontado": {
        "tipo": "booleano",
        "nula": false
      },
      "cupo_descontado": {
        "tipo": "booleano",
        "nula": false
      }
    },
    "pk": [
      "id"
    ],
    "unicas": {},
    "fks": [
      {
        "nombre": "order_items_listing_id_fkey",
        "columnas": [
          "listing_id"
        ],
        "tabla": "listings",
        "referencias": [
          "id"
        ]
      },
      {
        "nombre": "order_items_order_id_fkey",
        "columnas": [
          "order_id"
        ],
        "tabla": "orders",
        "referencias": [
          "id"
        ]
      },
      {
        "nombre": "order_items_provider_id_fkey",
        "columnas": [
          "provider_id"
        ],
        "tabla": "providers",
        "referencias": [
          "id"
        ]
      }
    ]
  },
  "orders": {
    "vista": false,
    "rls": true,
    "columnas": {
      "id": {
        "tipo": "uuid",
        "nula": false,
        "uuidPorDefecto": true
      },
      "reference": {
        "tipo": "texto",
        "nula": false
      },
      "buyer_id": {
        "tipo": "uuid",
        "nula": true
      },
      "buyer_email": {
        "tipo": "texto",
        "nula": false
      },
      "buyer_name": {
        "tipo": "texto",
        "nula": false
      },
      "buyer_company": {
        "tipo": "texto",
        "nula": true
      },
      "buyer_phone": {
        "tipo": "texto",
        "nula": true
      },
      "subtotal_cop": {
        "tipo": "entero",
        "nula": false
      },
      "commission_total_cop": {
        "tipo": "entero",
        "nula": false
      },
      "total_cop": {
        "tipo": "entero",
        "nula": false
      },
      "status": {
        "tipo": "enum",
        "nula": false
      },
      "payment_provider": {
        "tipo": "texto",
        "nula": true
      },
      "payment_reference": {
        "tipo": "texto",
        "nula": true
      },
      "notes": {
        "tipo": "texto",
        "nula": true
      },
      "created_at": {
        "tipo": "instante",
        "nula": false
      },
      "co2_kg_saved": {
        "tipo": "decimal",
        "nula": true
      },
      "water_liters_saved": {
        "tipo": "decimal",
        "nula": true
      },
      "waste_kg_reduced": {
        "tipo": "decimal",
        "nula": true
      },
      "buyer_provider_id": {
        "tipo": "uuid",
        "nula": true
      },
      "buyer_tax_id": {
        "tipo": "texto",
        "nula": true
      },
      "envio_total_cop": {
        "tipo": "entero",
        "nula": false
      },
      "envio_departamento": {
        "tipo": "texto",
        "nula": true
      },
      "envio_ciudad": {
        "tipo": "texto",
        "nula": true
      },
      "envio_direccion": {
        "tipo": "texto",
        "nula": true
      },
      "envio_indicaciones": {
        "tipo": "texto",
        "nula": true
      }
    },
    "pk": [
      "id"
    ],
    "unicas": {
      "orders_reference_key": [
        "reference"
      ]
    },
    "fks": [
      {
        "nombre": "orders_buyer_id_fkey",
        "columnas": [
          "buyer_id"
        ],
        "tabla": "usuarios",
        "referencias": [
          "id"
        ]
      },
      {
        "nombre": "orders_buyer_provider_id_fkey",
        "columnas": [
          "buyer_provider_id"
        ],
        "tabla": "providers",
        "referencias": [
          "id"
        ]
      }
    ]
  },
  "page_views": {
    "vista": false,
    "rls": true,
    "columnas": {
      "id": {
        "tipo": "entero",
        "nula": false,
        "autoincremental": true
      },
      "path": {
        "tipo": "texto",
        "nula": false
      },
      "referrer_host": {
        "tipo": "texto",
        "nula": true
      },
      "visitor": {
        "tipo": "texto",
        "nula": false
      },
      "device": {
        "tipo": "texto",
        "nula": false
      },
      "country": {
        "tipo": "texto",
        "nula": true
      },
      "created_at": {
        "tipo": "instante",
        "nula": false
      }
    },
    "pk": [
      "id"
    ],
    "unicas": {},
    "fks": []
  },
  "pagos": {
    "vista": false,
    "rls": true,
    "columnas": {
      "id": {
        "tipo": "uuid",
        "nula": false,
        "uuidPorDefecto": true
      },
      "order_id": {
        "tipo": "uuid",
        "nula": false
      },
      "pasarela": {
        "tipo": "texto",
        "nula": false
      },
      "transaccion": {
        "tipo": "texto",
        "nula": false
      },
      "estado": {
        "tipo": "texto",
        "nula": false
      },
      "monto_cop": {
        "tipo": "entero",
        "nula": false
      },
      "metodo": {
        "tipo": "texto",
        "nula": true
      },
      "created_at": {
        "tipo": "instante",
        "nula": false
      }
    },
    "pk": [
      "id"
    ],
    "unicas": {
      "pagos_pasarela_transaccion_estado_key": [
        "pasarela",
        "transaccion",
        "estado"
      ]
    },
    "fks": [
      {
        "nombre": "pagos_order_id_fkey",
        "columnas": [
          "order_id"
        ],
        "tabla": "orders",
        "referencias": [
          "id"
        ]
      }
    ]
  },
  "profiles": {
    "vista": false,
    "rls": true,
    "columnas": {
      "id": {
        "tipo": "uuid",
        "nula": false
      },
      "full_name": {
        "tipo": "texto",
        "nula": false
      },
      "phone": {
        "tipo": "texto",
        "nula": true
      },
      "company_name": {
        "tipo": "texto",
        "nula": true
      },
      "tax_id": {
        "tipo": "texto",
        "nula": true
      },
      "created_at": {
        "tipo": "instante",
        "nula": false
      },
      "avatar_url": {
        "tipo": "texto",
        "nula": true
      }
    },
    "pk": [
      "id"
    ],
    "unicas": {},
    "fks": [
      {
        "nombre": "profiles_id_fkey",
        "columnas": [
          "id"
        ],
        "tabla": "usuarios",
        "referencias": [
          "id"
        ]
      }
    ]
  },
  "prospectos": {
    "vista": false,
    "rls": true,
    "columnas": {
      "id": {
        "tipo": "uuid",
        "nula": false,
        "uuidPorDefecto": true
      },
      "nombre": {
        "tipo": "texto",
        "nula": false
      },
      "nit": {
        "tipo": "texto",
        "nula": true
      },
      "correo": {
        "tipo": "texto",
        "nula": true
      },
      "telefono": {
        "tipo": "texto",
        "nula": true
      },
      "sitio_web": {
        "tipo": "texto",
        "nula": true
      },
      "instagram": {
        "tipo": "texto",
        "nula": true
      },
      "ciudad": {
        "tipo": "texto",
        "nula": true
      },
      "departamento": {
        "tipo": "texto",
        "nula": true
      },
      "categoria": {
        "tipo": "texto",
        "nula": true
      },
      "encaje": {
        "tipo": "texto",
        "nula": true
      },
      "fuente": {
        "tipo": "texto",
        "nula": true
      },
      "notas": {
        "tipo": "texto",
        "nula": true
      },
      "estado": {
        "tipo": "texto",
        "nula": false
      },
      "ultimo_envio_at": {
        "tipo": "instante",
        "nula": true
      },
      "token": {
        "tipo": "uuid",
        "nula": false,
        "uuidPorDefecto": true
      },
      "baja_at": {
        "tipo": "instante",
        "nula": true
      },
      "created_at": {
        "tipo": "instante",
        "nula": false
      },
      "updated_at": {
        "tipo": "instante",
        "nula": false
      }
    },
    "pk": [
      "id"
    ],
    "unicas": {
      "prospectos_token_key": [
        "token"
      ],
      "prospectos_correo_idx": [
        "correo_unico"
      ]
    },
    "fks": []
  },
  "provider_applications": {
    "vista": false,
    "rls": true,
    "columnas": {
      "id": {
        "tipo": "uuid",
        "nula": false,
        "uuidPorDefecto": true
      },
      "user_id": {
        "tipo": "uuid",
        "nula": true
      },
      "name": {
        "tipo": "texto",
        "nula": false
      },
      "contact_name": {
        "tipo": "texto",
        "nula": false
      },
      "email": {
        "tipo": "texto",
        "nula": false
      },
      "phone": {
        "tipo": "texto",
        "nula": false
      },
      "department": {
        "tipo": "texto",
        "nula": false
      },
      "city": {
        "tipo": "texto",
        "nula": false
      },
      "website": {
        "tipo": "texto",
        "nula": true
      },
      "description": {
        "tipo": "texto",
        "nula": false
      },
      "status": {
        "tipo": "enum",
        "nula": false
      },
      "reviewer_notes": {
        "tipo": "texto",
        "nula": true
      },
      "reviewed_by": {
        "tipo": "uuid",
        "nula": true
      },
      "reviewed_at": {
        "tipo": "instante",
        "nula": true
      },
      "provider_id": {
        "tipo": "uuid",
        "nula": true
      },
      "created_at": {
        "tipo": "instante",
        "nula": false
      },
      "country": {
        "tipo": "texto",
        "nula": false
      },
      "org_type": {
        "tipo": "texto",
        "nula": true
      },
      "tax_id_kind": {
        "tipo": "texto",
        "nula": true
      },
      "tax_id": {
        "tipo": "texto",
        "nula": true
      },
      "categories": {
        "tipo": "json",
        "nula": false
      },
      "consent_at": {
        "tipo": "instante",
        "nula": true
      }
    },
    "pk": [
      "id"
    ],
    "unicas": {},
    "fks": [
      {
        "nombre": "provider_applications_provider_id_fkey",
        "columnas": [
          "provider_id"
        ],
        "tabla": "providers",
        "referencias": [
          "id"
        ]
      },
      {
        "nombre": "provider_applications_reviewed_by_fkey",
        "columnas": [
          "reviewed_by"
        ],
        "tabla": "usuarios",
        "referencias": [
          "id"
        ]
      },
      {
        "nombre": "provider_applications_user_id_fkey",
        "columnas": [
          "user_id"
        ],
        "tabla": "usuarios",
        "referencias": [
          "id"
        ]
      }
    ]
  },
  "provider_certifications": {
    "vista": false,
    "rls": true,
    "columnas": {
      "id": {
        "tipo": "uuid",
        "nula": false,
        "uuidPorDefecto": true
      },
      "provider_id": {
        "tipo": "uuid",
        "nula": false
      },
      "certification_code": {
        "tipo": "texto",
        "nula": false
      },
      "document_url": {
        "tipo": "texto",
        "nula": true
      },
      "issued_at": {
        "tipo": "fecha",
        "nula": true
      },
      "expires_at": {
        "tipo": "fecha",
        "nula": true
      },
      "verified_at": {
        "tipo": "instante",
        "nula": true
      },
      "verified_by": {
        "tipo": "uuid",
        "nula": true
      }
    },
    "pk": [
      "id"
    ],
    "unicas": {
      "provider_certifications_provider_id_certification_code_key": [
        "provider_id",
        "certification_code"
      ]
    },
    "fks": [
      {
        "nombre": "provider_certifications_certification_code_fkey",
        "columnas": [
          "certification_code"
        ],
        "tabla": "certifications",
        "referencias": [
          "code"
        ]
      },
      {
        "nombre": "provider_certifications_provider_id_fkey",
        "columnas": [
          "provider_id"
        ],
        "tabla": "providers",
        "referencias": [
          "id"
        ]
      },
      {
        "nombre": "provider_certifications_verified_by_fkey",
        "columnas": [
          "verified_by"
        ],
        "tabla": "usuarios",
        "referencias": [
          "id"
        ]
      }
    ]
  },
  "provider_members": {
    "vista": false,
    "rls": true,
    "columnas": {
      "provider_id": {
        "tipo": "uuid",
        "nula": false
      },
      "user_id": {
        "tipo": "uuid",
        "nula": false
      },
      "is_owner": {
        "tipo": "booleano",
        "nula": false
      }
    },
    "pk": [
      "provider_id",
      "user_id"
    ],
    "unicas": {},
    "fks": [
      {
        "nombre": "provider_members_provider_id_fkey",
        "columnas": [
          "provider_id"
        ],
        "tabla": "providers",
        "referencias": [
          "id"
        ]
      },
      {
        "nombre": "provider_members_user_id_fkey",
        "columnas": [
          "user_id"
        ],
        "tabla": "usuarios",
        "referencias": [
          "id"
        ]
      }
    ]
  },
  "providers": {
    "vista": false,
    "rls": true,
    "columnas": {
      "id": {
        "tipo": "uuid",
        "nula": false,
        "uuidPorDefecto": true
      },
      "slug": {
        "tipo": "texto",
        "nula": false
      },
      "name": {
        "tipo": "texto",
        "nula": false
      },
      "legal_name": {
        "tipo": "texto",
        "nula": true
      },
      "tax_id": {
        "tipo": "texto",
        "nula": true
      },
      "tagline": {
        "tipo": "texto",
        "nula": false
      },
      "description": {
        "tipo": "texto",
        "nula": false
      },
      "logo_url": {
        "tipo": "texto",
        "nula": true
      },
      "cover_url": {
        "tipo": "texto",
        "nula": true
      },
      "department": {
        "tipo": "texto",
        "nula": false
      },
      "city": {
        "tipo": "texto",
        "nula": false
      },
      "website": {
        "tipo": "texto",
        "nula": true
      },
      "email": {
        "tipo": "texto",
        "nula": false
      },
      "phone": {
        "tipo": "texto",
        "nula": true
      },
      "status": {
        "tipo": "enum",
        "nula": false
      },
      "sustainability_score": {
        "tipo": "entero",
        "nula": false
      },
      "tier": {
        "tipo": "enum",
        "nula": false
      },
      "founded_year": {
        "tipo": "entero",
        "nula": true
      },
      "traits": {
        "tipo": "json",
        "nula": false
      },
      "payout_bank": {
        "tipo": "texto",
        "nula": true
      },
      "payout_account_masked": {
        "tipo": "texto",
        "nula": true
      },
      "created_at": {
        "tipo": "instante",
        "nula": false
      },
      "busqueda": {
        "tipo": "texto",
        "nula": true,
        "generada": true
      },
      "experience_points": {
        "tipo": "entero",
        "nula": false
      },
      "sustainability_verified_at": {
        "tipo": "instante",
        "nula": true
      },
      "country": {
        "tipo": "texto",
        "nula": false
      },
      "giros": {
        "tipo": "json",
        "nula": false
      },
      "cerrada_at": {
        "tipo": "instante",
        "nula": true
      },
      "cerrada_por": {
        "tipo": "uuid",
        "nula": true
      },
      "clave_tributaria": {
        "tipo": "texto",
        "nula": true,
        "generada": true
      }
    },
    "pk": [
      "id"
    ],
    "unicas": {
      "providers_slug_key": [
        "slug"
      ]
    },
    "fks": []
  },
  "quotation_items": {
    "vista": false,
    "rls": true,
    "columnas": {
      "id": {
        "tipo": "uuid",
        "nula": false,
        "uuidPorDefecto": true
      },
      "quotation_id": {
        "tipo": "uuid",
        "nula": false
      },
      "listing_id": {
        "tipo": "uuid",
        "nula": true
      },
      "provider_id": {
        "tipo": "uuid",
        "nula": false
      },
      "title_snapshot": {
        "tipo": "texto",
        "nula": false
      },
      "qty": {
        "tipo": "entero",
        "nula": false
      },
      "quoted_unit_price_cop": {
        "tipo": "entero",
        "nula": true
      }
    },
    "pk": [
      "id"
    ],
    "unicas": {},
    "fks": [
      {
        "nombre": "quotation_items_listing_id_fkey",
        "columnas": [
          "listing_id"
        ],
        "tabla": "listings",
        "referencias": [
          "id"
        ]
      },
      {
        "nombre": "quotation_items_provider_id_fkey",
        "columnas": [
          "provider_id"
        ],
        "tabla": "providers",
        "referencias": [
          "id"
        ]
      },
      {
        "nombre": "quotation_items_quotation_id_fkey",
        "columnas": [
          "quotation_id"
        ],
        "tabla": "quotations",
        "referencias": [
          "id"
        ]
      }
    ]
  },
  "quotations": {
    "vista": false,
    "rls": true,
    "columnas": {
      "id": {
        "tipo": "uuid",
        "nula": false,
        "uuidPorDefecto": true
      },
      "reference": {
        "tipo": "texto",
        "nula": false
      },
      "buyer_id": {
        "tipo": "uuid",
        "nula": true
      },
      "buyer_email": {
        "tipo": "texto",
        "nula": false
      },
      "buyer_name": {
        "tipo": "texto",
        "nula": false
      },
      "buyer_company": {
        "tipo": "texto",
        "nula": true
      },
      "buyer_phone": {
        "tipo": "texto",
        "nula": true
      },
      "message": {
        "tipo": "texto",
        "nula": true
      },
      "status": {
        "tipo": "texto",
        "nula": false
      },
      "responded_at": {
        "tipo": "instante",
        "nula": true
      },
      "created_at": {
        "tipo": "instante",
        "nula": false
      }
    },
    "pk": [
      "id"
    ],
    "unicas": {
      "quotations_reference_key": [
        "reference"
      ]
    },
    "fks": [
      {
        "nombre": "quotations_buyer_id_fkey",
        "columnas": [
          "buyer_id"
        ],
        "tabla": "usuarios",
        "referencias": [
          "id"
        ]
      }
    ]
  },
  "reviews": {
    "vista": false,
    "rls": true,
    "columnas": {
      "id": {
        "tipo": "uuid",
        "nula": false,
        "uuidPorDefecto": true
      },
      "listing_id": {
        "tipo": "uuid",
        "nula": false
      },
      "author_id": {
        "tipo": "uuid",
        "nula": false
      },
      "order_item_id": {
        "tipo": "uuid",
        "nula": false
      },
      "rating": {
        "tipo": "entero",
        "nula": false
      },
      "body": {
        "tipo": "texto",
        "nula": false
      },
      "created_at": {
        "tipo": "instante",
        "nula": false
      },
      "oculta": {
        "tipo": "booleano",
        "nula": false
      },
      "autor_nombre": {
        "tipo": "texto",
        "nula": true
      },
      "updated_at": {
        "tipo": "instante",
        "nula": true
      }
    },
    "pk": [
      "id"
    ],
    "unicas": {
      "reviews_order_item_id_key": [
        "order_item_id"
      ]
    },
    "fks": [
      {
        "nombre": "reviews_author_id_fkey",
        "columnas": [
          "author_id"
        ],
        "tabla": "usuarios",
        "referencias": [
          "id"
        ]
      },
      {
        "nombre": "reviews_listing_id_fkey",
        "columnas": [
          "listing_id"
        ],
        "tabla": "listings",
        "referencias": [
          "id"
        ]
      },
      {
        "nombre": "reviews_order_item_id_fkey",
        "columnas": [
          "order_item_id"
        ],
        "tabla": "order_items",
        "referencias": [
          "id"
        ]
      }
    ]
  },
  "sustainability_assessments": {
    "vista": false,
    "rls": true,
    "columnas": {
      "id": {
        "tipo": "uuid",
        "nula": false,
        "uuidPorDefecto": true
      },
      "provider_id": {
        "tipo": "uuid",
        "nula": false
      },
      "answers": {
        "tipo": "json",
        "nula": false
      },
      "breakdown": {
        "tipo": "json",
        "nula": false
      },
      "score": {
        "tipo": "entero",
        "nula": false
      },
      "tier": {
        "tipo": "enum",
        "nula": false
      },
      "status": {
        "tipo": "enum",
        "nula": false
      },
      "reviewer_notes": {
        "tipo": "texto",
        "nula": true
      },
      "reviewed_by": {
        "tipo": "uuid",
        "nula": true
      },
      "reviewed_at": {
        "tipo": "instante",
        "nula": true
      },
      "submitted_at": {
        "tipo": "instante",
        "nula": true
      },
      "created_at": {
        "tipo": "instante",
        "nula": false
      }
    },
    "pk": [
      "id"
    ],
    "unicas": {},
    "fks": [
      {
        "nombre": "sustainability_assessments_provider_id_fkey",
        "columnas": [
          "provider_id"
        ],
        "tabla": "providers",
        "referencias": [
          "id"
        ]
      },
      {
        "nombre": "sustainability_assessments_reviewed_by_fkey",
        "columnas": [
          "reviewed_by"
        ],
        "tabla": "usuarios",
        "referencias": [
          "id"
        ]
      }
    ]
  },
  "trusted_devices": {
    "vista": false,
    "rls": true,
    "columnas": {
      "id": {
        "tipo": "uuid",
        "nula": false,
        "uuidPorDefecto": true
      },
      "user_id": {
        "tipo": "uuid",
        "nula": false
      },
      "device_hash": {
        "tipo": "texto",
        "nula": false
      },
      "label": {
        "tipo": "texto",
        "nula": false
      },
      "last_seen_at": {
        "tipo": "instante",
        "nula": false
      },
      "created_at": {
        "tipo": "instante",
        "nula": false
      }
    },
    "pk": [
      "id"
    ],
    "unicas": {
      "trusted_devices_user_id_device_hash_key": [
        "user_id",
        "device_hash"
      ]
    },
    "fks": [
      {
        "nombre": "trusted_devices_user_id_fkey",
        "columnas": [
          "user_id"
        ],
        "tabla": "usuarios",
        "referencias": [
          "id"
        ]
      }
    ]
  },
  "user_roles": {
    "vista": false,
    "rls": true,
    "columnas": {
      "user_id": {
        "tipo": "uuid",
        "nula": false
      },
      "role": {
        "tipo": "enum",
        "nula": false
      },
      "granted_at": {
        "tipo": "instante",
        "nula": false
      }
    },
    "pk": [
      "user_id",
      "role"
    ],
    "unicas": {},
    "fks": [
      {
        "nombre": "user_roles_user_id_fkey",
        "columnas": [
          "user_id"
        ],
        "tabla": "usuarios",
        "referencias": [
          "id"
        ]
      }
    ]
  },
  "calificaciones_oferta": {
    "vista": true,
    "rls": false,
    "columnas": {
      "listing_id": {
        "tipo": "uuid",
        "nula": true
      },
      "promedio": {
        "tipo": "decimal",
        "nula": true
      },
      "cantidad": {
        "tipo": "entero",
        "nula": true
      }
    },
    "pk": [],
    "unicas": {},
    "fks": []
  },
  "calificaciones_proveedor": {
    "vista": true,
    "rls": false,
    "columnas": {
      "provider_id": {
        "tipo": "uuid",
        "nula": true
      },
      "promedio": {
        "tipo": "decimal",
        "nula": true
      },
      "cantidad": {
        "tipo": "entero",
        "nula": true
      }
    },
    "pk": [],
    "unicas": {},
    "fks": []
  },
  "listings_publicos": {
    "vista": true,
    "rls": false,
    "columnas": {
      "id": {
        "tipo": "uuid",
        "nula": true
      },
      "slug": {
        "tipo": "texto",
        "nula": true
      },
      "provider_id": {
        "tipo": "uuid",
        "nula": true
      },
      "kind": {
        "tipo": "enum",
        "nula": true
      },
      "title": {
        "tipo": "texto",
        "nula": true
      },
      "summary": {
        "tipo": "texto",
        "nula": true
      },
      "description": {
        "tipo": "texto",
        "nula": true
      },
      "category": {
        "tipo": "texto",
        "nula": true
      },
      "verticals": {
        "tipo": "json",
        "nula": true
      },
      "images": {
        "tipo": "json",
        "nula": true
      },
      "price_cop": {
        "tipo": "entero",
        "nula": true
      },
      "wholesale_price_cop": {
        "tipo": "entero",
        "nula": true
      },
      "wholesale_min_qty": {
        "tipo": "entero",
        "nula": true
      },
      "unit": {
        "tipo": "texto",
        "nula": true
      },
      "quote_only": {
        "tipo": "booleano",
        "nula": true
      },
      "stock": {
        "tipo": "entero",
        "nula": true
      },
      "co2_kg_saved": {
        "tipo": "decimal",
        "nula": true
      },
      "water_liters_saved": {
        "tipo": "decimal",
        "nula": true
      },
      "waste_kg_reduced": {
        "tipo": "decimal",
        "nula": true
      },
      "certifications": {
        "tipo": "json",
        "nula": true
      },
      "department": {
        "tipo": "texto",
        "nula": true
      },
      "city": {
        "tipo": "texto",
        "nula": true
      },
      "status": {
        "tipo": "enum",
        "nula": true
      },
      "featured": {
        "tipo": "booleano",
        "nula": true
      },
      "duration_hours": {
        "tipo": "entero",
        "nula": true
      },
      "min_people": {
        "tipo": "entero",
        "nula": true
      },
      "max_people": {
        "tipo": "entero",
        "nula": true
      },
      "meeting_point": {
        "tipo": "texto",
        "nula": true
      },
      "includes": {
        "tipo": "json",
        "nula": true
      },
      "delivery_time": {
        "tipo": "texto",
        "nula": true
      },
      "scope": {
        "tipo": "json",
        "nula": true
      },
      "created_at": {
        "tipo": "instante",
        "nula": true
      },
      "busqueda": {
        "tipo": "texto",
        "nula": true
      },
      "impacto": {
        "tipo": "decimal",
        "nula": true
      },
      "subcategory": {
        "tipo": "texto",
        "nula": true
      },
      "aporte_ambiental": {
        "tipo": "texto",
        "nula": true
      },
      "consecuencia_ambiental": {
        "tipo": "texto",
        "nula": true
      },
      "huella_co2_kg": {
        "tipo": "decimal",
        "nula": true
      },
      "despacho": {
        "tipo": "texto",
        "nula": true
      },
      "transportadora": {
        "tipo": "texto",
        "nula": true
      },
      "envio_cop": {
        "tipo": "entero",
        "nula": true
      },
      "entrega_dias_min": {
        "tipo": "entero",
        "nula": true
      },
      "entrega_dias_max": {
        "tipo": "entero",
        "nula": true
      },
      "version": {
        "tipo": "entero",
        "nula": true
      },
      "envio_local_cop": {
        "tipo": "entero",
        "nula": true
      },
      "envio_adicional_cop": {
        "tipo": "entero",
        "nula": true
      },
      "peso_kg": {
        "tipo": "decimal",
        "nula": true
      },
      "largo_cm": {
        "tipo": "entero",
        "nula": true
      },
      "ancho_cm": {
        "tipo": "entero",
        "nula": true
      },
      "alto_cm": {
        "tipo": "entero",
        "nula": true
      },
      "provider_slug": {
        "tipo": "texto",
        "nula": true
      },
      "provider_name": {
        "tipo": "texto",
        "nula": true
      },
      "provider_score": {
        "tipo": "entero",
        "nula": true
      },
      "provider_tier": {
        "tipo": "enum",
        "nula": true
      },
      "provider_busqueda": {
        "tipo": "texto",
        "nula": true
      }
    },
    "pk": [],
    "unicas": {},
    "fks": []
  }
};

export const POLITICAS: Record<string, Politica[]> = {
  "campanas": [
    {
      "nombre": "campanas_admin",
      "orden": "ALL",
      "usando": "is_admin()",
      "comprobando": "is_admin()"
    }
  ],
  "certifications": [
    {
      "nombre": "certifications_admin",
      "orden": "ALL",
      "usando": "is_admin()",
      "comprobando": "is_admin()"
    },
    {
      "nombre": "certifications_read",
      "orden": "SELECT",
      "usando": "true",
      "comprobando": null
    }
  ],
  "community_posts": [
    {
      "nombre": "community_posts_admin",
      "orden": "ALL",
      "usando": "is_admin()",
      "comprobando": "is_admin()"
    },
    {
      "nombre": "community_posts_delete_own",
      "orden": "DELETE",
      "usando": "(author_id = auth_uid())",
      "comprobando": null
    },
    {
      "nombre": "community_posts_insert",
      "orden": "INSERT",
      "usando": null,
      "comprobando": "((author_id = auth_uid()) AND ((provider_id IS NULL) OR manages_provider(provider_id)))"
    },
    {
      "nombre": "community_posts_read",
      "orden": "SELECT",
      "usando": "((status = 'approved') OR (author_id = auth_uid()) OR is_admin())",
      "comprobando": null
    },
    {
      "nombre": "community_posts_update_own",
      "orden": "UPDATE",
      "usando": "((author_id = auth_uid()) AND (status = 'approved'))",
      "comprobando": "(author_id = auth_uid())"
    }
  ],
  "community_reactions": [
    {
      "nombre": "community_reactions_delete_own",
      "orden": "DELETE",
      "usando": "(user_id = auth_uid())",
      "comprobando": null
    },
    {
      "nombre": "community_reactions_read_own",
      "orden": "SELECT",
      "usando": "((user_id = auth_uid()) OR is_admin())",
      "comprobando": null
    },
    {
      "nombre": "community_reactions_write_own",
      "orden": "INSERT",
      "usando": null,
      "comprobando": "(user_id = auth_uid())"
    }
  ],
  "envios_de_campana": [
    {
      "nombre": "envios_de_campana_admin",
      "orden": "ALL",
      "usando": "is_admin()",
      "comprobando": "is_admin()"
    }
  ],
  "experience_events": [
    {
      "nombre": "experience_events_read",
      "orden": "SELECT",
      "usando": "(manages_provider(provider_id) OR is_admin())",
      "comprobando": null
    }
  ],
  "listing_availability": [
    {
      "nombre": "availability_admin",
      "orden": "ALL",
      "usando": "is_admin()",
      "comprobando": "is_admin()"
    },
    {
      "nombre": "availability_read",
      "orden": "SELECT",
      "usando": "true",
      "comprobando": null
    },
    {
      "nombre": "availability_write",
      "orden": "ALL",
      "usando": "(EXISTS ( SELECT 1\n   FROM listings l\n  WHERE ((l.id = listing_availability.listing_id) AND manages_provider(l.provider_id))))",
      "comprobando": "(EXISTS ( SELECT 1\n   FROM listings l\n  WHERE ((l.id = listing_availability.listing_id) AND manages_provider(l.provider_id))))"
    }
  ],
  "listings": [
    {
      "nombre": "listings_admin",
      "orden": "ALL",
      "usando": "is_admin()",
      "comprobando": "is_admin()"
    },
    {
      "nombre": "listings_provider_write",
      "orden": "ALL",
      "usando": "manages_provider(provider_id)",
      "comprobando": "manages_provider(provider_id)"
    },
    {
      "nombre": "listings_public_read",
      "orden": "SELECT",
      "usando": "(((status = 'approved') AND (EXISTS ( SELECT 1\n   FROM providers p\n  WHERE ((p.id = listings.provider_id) AND (p.status = 'approved'))))) OR manages_provider(provider_id) OR is_admin())",
      "comprobando": null
    }
  ],
  "order_items": [
    {
      "nombre": "order_items_admin",
      "orden": "ALL",
      "usando": "is_admin()",
      "comprobando": "is_admin()"
    },
    {
      "nombre": "order_items_read",
      "orden": "SELECT",
      "usando": "(manages_provider(provider_id) OR owns_order(order_id) OR is_admin())",
      "comprobando": null
    }
  ],
  "orders": [
    {
      "nombre": "orders_admin",
      "orden": "ALL",
      "usando": "is_admin()",
      "comprobando": "is_admin()"
    },
    {
      "nombre": "orders_buyer_read",
      "orden": "SELECT",
      "usando": "((buyer_id = auth_uid()) OR is_admin())",
      "comprobando": null
    },
    {
      "nombre": "orders_provider_read",
      "orden": "SELECT",
      "usando": "manages_order(id)",
      "comprobando": null
    }
  ],
  "page_views": [
    {
      "nombre": "page_views_admin_read",
      "orden": "SELECT",
      "usando": "is_admin()",
      "comprobando": null
    }
  ],
  "pagos": [
    {
      "nombre": "pagos_admin_read",
      "orden": "SELECT",
      "usando": "is_admin()",
      "comprobando": null
    },
    {
      "nombre": "pagos_buyer_read",
      "orden": "SELECT",
      "usando": "owns_order(order_id)",
      "comprobando": null
    }
  ],
  "profiles": [
    {
      "nombre": "profiles_admin",
      "orden": "SELECT",
      "usando": "is_admin()",
      "comprobando": null
    },
    {
      "nombre": "profiles_own",
      "orden": "ALL",
      "usando": "(id = auth_uid())",
      "comprobando": "(id = auth_uid())"
    }
  ],
  "prospectos": [
    {
      "nombre": "prospectos_admin",
      "orden": "ALL",
      "usando": "is_admin()",
      "comprobando": "is_admin()"
    }
  ],
  "provider_applications": [
    {
      "nombre": "provider_applications_admin",
      "orden": "ALL",
      "usando": "is_admin()",
      "comprobando": "is_admin()"
    },
    {
      "nombre": "provider_applications_insert",
      "orden": "INSERT",
      "usando": null,
      "comprobando": "((user_id IS NULL) OR (user_id = auth_uid()))"
    },
    {
      "nombre": "provider_applications_read_own",
      "orden": "SELECT",
      "usando": "(user_id = auth_uid())",
      "comprobando": null
    }
  ],
  "provider_certifications": [
    {
      "nombre": "provider_certs_admin",
      "orden": "ALL",
      "usando": "is_admin()",
      "comprobando": "is_admin()"
    },
    {
      "nombre": "provider_certs_public_read",
      "orden": "SELECT",
      "usando": "(verified_at IS NOT NULL)",
      "comprobando": null
    },
    {
      "nombre": "provider_certs_read",
      "orden": "SELECT",
      "usando": "(manages_provider(provider_id) OR is_admin())",
      "comprobando": null
    },
    {
      "nombre": "provider_certs_write",
      "orden": "INSERT",
      "usando": null,
      "comprobando": "(manages_provider(provider_id) AND (verified_at IS NULL) AND (verified_by IS NULL))"
    }
  ],
  "provider_members": [
    {
      "nombre": "provider_members_admin",
      "orden": "ALL",
      "usando": "is_admin()",
      "comprobando": "is_admin()"
    },
    {
      "nombre": "provider_members_read",
      "orden": "SELECT",
      "usando": "((user_id = auth_uid()) OR manages_provider(provider_id) OR is_admin())",
      "comprobando": null
    }
  ],
  "providers": [
    {
      "nombre": "providers_admin_all",
      "orden": "ALL",
      "usando": "is_admin()",
      "comprobando": "is_admin()"
    },
    {
      "nombre": "providers_insert",
      "orden": "INSERT",
      "usando": null,
      "comprobando": "((auth_uid() IS NOT NULL) AND (status  in ('draft', 'pending_review')))"
    },
    {
      "nombre": "providers_member_update",
      "orden": "UPDATE",
      "usando": "manages_provider(id)",
      "comprobando": "manages_provider(id)"
    },
    {
      "nombre": "providers_public_read",
      "orden": "SELECT",
      "usando": "((status = 'approved') OR manages_provider(id) OR is_admin())",
      "comprobando": null
    }
  ],
  "quotation_items": [
    {
      "nombre": "quotation_items_insert",
      "orden": "INSERT",
      "usando": null,
      "comprobando": "(EXISTS ( SELECT 1\n   FROM quotations q\n  WHERE ((q.id = quotation_items.quotation_id) AND ((q.buyer_id IS NULL) OR (q.buyer_id = auth_uid())))))"
    },
    {
      "nombre": "quotation_items_provider_quote",
      "orden": "UPDATE",
      "usando": "manages_provider(provider_id)",
      "comprobando": "manages_provider(provider_id)"
    },
    {
      "nombre": "quotation_items_read",
      "orden": "SELECT",
      "usando": "(manages_provider(provider_id) OR owns_quotation(quotation_id) OR is_admin())",
      "comprobando": null
    }
  ],
  "quotations": [
    {
      "nombre": "quotations_admin",
      "orden": "ALL",
      "usando": "is_admin()",
      "comprobando": "is_admin()"
    },
    {
      "nombre": "quotations_insert",
      "orden": "INSERT",
      "usando": null,
      "comprobando": "((buyer_id IS NULL) OR (buyer_id = auth_uid()))"
    },
    {
      "nombre": "quotations_read",
      "orden": "SELECT",
      "usando": "((buyer_id = auth_uid()) OR is_admin() OR manages_quotation(id))",
      "comprobando": null
    }
  ],
  "reviews": [
    {
      "nombre": "reviews_admin",
      "orden": "UPDATE",
      "usando": "is_admin()",
      "comprobando": "is_admin()"
    },
    {
      "nombre": "reviews_public_read",
      "orden": "SELECT",
      "usando": "((NOT oculta) OR (author_id = auth_uid()) OR is_admin())",
      "comprobando": null
    }
  ],
  "sustainability_assessments": [
    {
      "nombre": "assessments_admin",
      "orden": "ALL",
      "usando": "is_admin()",
      "comprobando": "is_admin()"
    },
    {
      "nombre": "assessments_read",
      "orden": "SELECT",
      "usando": "(manages_provider(provider_id) OR is_admin())",
      "comprobando": null
    },
    {
      "nombre": "assessments_update_draft",
      "orden": "UPDATE",
      "usando": "(manages_provider(provider_id) AND (status  in ('draft', 'rejected')))",
      "comprobando": "(manages_provider(provider_id) AND (status  in ('draft', 'pending_review')))"
    },
    {
      "nombre": "assessments_write",
      "orden": "INSERT",
      "usando": null,
      "comprobando": "(manages_provider(provider_id) AND (status  in ('draft', 'pending_review')))"
    }
  ],
  "trusted_devices": [
    {
      "nombre": "trusted_devices_own",
      "orden": "ALL",
      "usando": "(user_id = auth_uid())",
      "comprobando": "(user_id = auth_uid())"
    }
  ],
  "user_roles": [
    {
      "nombre": "user_roles_admin_write",
      "orden": "ALL",
      "usando": "is_admin()",
      "comprobando": "is_admin()"
    },
    {
      "nombre": "user_roles_read_own",
      "orden": "SELECT",
      "usando": "((user_id = auth_uid()) OR is_admin())",
      "comprobando": null
    }
  ]
};
