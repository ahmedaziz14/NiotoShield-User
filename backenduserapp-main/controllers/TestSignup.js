const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');
const jwt = require('jsonwebtoken');

const TsignUp = async (req, res) => {
  const { email, password, product_key } = req.body;

  try {
    // Vérifier si la clé produit existe et n'est pas encore utilisée
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('product_key, used, admin_id')
      .eq('product_key', product_key)
      .eq('used', false)
      .single();

    if (!product || productError) {
      return res.status(400).json({ error: 'Clé produit invalide ou déjà utilisée.' });
    }

    // Hachage du mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insérer la demande d'inscription
    const message = `Une personne veut utiliser la clé produit ${product_key}`;
    const { data: request, error: requestError } = await supabase
      .from('signup_requests')
      .insert([
        {
          admin_id: product.admin_id,
          message,
          Accepted: null,
        },
      ])
      .select()
      .single();

    if (requestError || !request) {
      console.error('Erreur lors de l\'insertion de la demande d\'inscription:', requestError);
      return res.status(500).json({ error: 'Échec du traitement de la demande d\'inscription.' });
    }

    console.log('📢 Demande d\'inscription créée:', request.id);

    // Optionnel: Émettre au room admin (décommenter si l'admin frontend écoute le backend user)
    /*
    const io = req.app.get('io');
    io.to(product.admin_id).emit('signup-request', {
      id: request.id,
      admin_id: product.admin_id,
      message,
      accepted: null,
      created_at: request.created_at,
    });
    console.log('📢 Demande d\'inscription envoyée au room admin:', product.admin_id);
    */

    // Écouter les changements sur accepted
    let resolved = false;
    const timeout = 5 * 60 * 1000; // 5 minutes
    const channel = supabase
      .channel(`signup-request-${request.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'signup_requests',
          filter: `id=eq.${request.id}`,
        },
        async (payload) => {
          const { Accepted } = payload.new;
          console.log(`📩 Demande d\'inscription mise à jour: requestId=${request.id}, Accepted=${Accepted}`);
          resolved = true;

          if (Accepted === true) {
            // Compléter l'inscription
            const { data: user, error: userError } = await supabase
              .from('users')
              .insert([{ email, password: hashedPassword }])
              .select()
              .single();

            if (userError) {
              console.error('Erreur lors de la création de l\'utilisateur:', userError);
              await supabase.from('signup_requests').delete().eq('id', request.id);
              return res.status(400).json({ error: 'Échec de l\'inscription de l\'utilisateur.' });
            }

            // Mettre à jour la clé produit
            const { error: updateError } = await supabase
              .from('products')
              .update({ used: true, user_id: user.id })
              .eq('product_key', product_key);

            if (updateError) {
              console.error('Erreur lors de la mise à jour de la clé produit:', updateError);
              await supabase.from('signup_requests').delete().eq('id', request.id);
              return res.status(500).json({ error: 'Utilisateur inscrit, mais échec de la mise à jour de la clé produit.' });
            }

            const{ error:notificationerror} = await supabase
            .from('admin_notifications')
            .insert([{ admin_id: product.admin_id , message: `The user with the ID ${user.id} used the product key ${product_key} to create their account.`}]);

            if (notificationerror) {
              console.error('Erreur lors de l\'insertion dans notifications:', notificationerror);
               return res.status(500).json({ error: 'Échec de l\insertion du notification.' });
            }

            // Insérer dans localisations
            const { error: localisationError } = await supabase
              .from('localisations')
              .insert([{ user_id: user.id, product_key }]);


            if (localisationError) {
              console.error('Erreur lors de l\'insertion dans localisations:', localisationError);
              await supabase.from('signup_requests').delete().eq('id', request.id);
              return res.status(500).json({ error: 'Échec de l\'initialisation des données de localisation.' });
            }

            // Créer le profil utilisateur
            const { error: profileError } = await supabase
              .from('user_profiles')
              .insert([
                {
                  id: user.id,
                  name: '',
                  interest: '',
                  more_info: '',
                  image_urls: [],
                  admin_id: product.admin_id,
                },
              ]);

            if (profileError) {
              console.error('Erreur lors de l\'insertion dans user_profiles:', profileError);
              await supabase.from('signup_requests').delete().eq('id', request.id);
              return res.status(500).json({ error: 'Échec de la création du profil utilisateur.' });
            }

            // Insérer la notification de bienvenue
            const { error: notificationError } = await supabase
              .from('notifications')
              .insert([
                {
                  user_id: user.id,
                  message: 'Bienvenue sur notre plateforme ! Nous sommes ravis de vous accueillir.',
                  is_read: false,
                },
              ]);

            if (notificationError) {
              console.error('Erreur lors de l\'insertion de la notification de bienvenue:', notificationError);
            }

            // Insérer les paramètres par défaut
            const defaultSettings = {
              pushNotifications: true,
              updateFrequency: '10',
              selectedServices: ['weather', 'traffic'],
              theme: 'light',
              language: 'fr',
            };
            const { error: settingsError } = await supabase
              .from('user_settings')
              .insert([{ user_id: user.id, settings: defaultSettings }]);

            if (settingsError) {
              console.error('Erreur lors de l\'insertion dans user_settings:', settingsError);
              await supabase.from('signup_requests').delete().eq('id', request.id);
              return res.status(500).json({ error: 'Utilisateur inscrit, mais échec de l\'initialisation des paramètres.' });
            }

            // Nettoyage
            await supabase.from('signup_requests').delete().eq('id', request.id);
            res.status(201).json({ message: 'Utilisateur inscrit avec succès !', user });
          } else if (Accepted === false) {
            // Rejeter l'inscription
            await supabase.from('signup_requests').delete().eq('id', request.id);
            res.status(403).json({ error: 'Demande d\'inscription rejetée par l\'administrateur.' });
          }

          // Désinscription
          supabase.removeChannel(channel);
        }
      )
      .subscribe((status) => {
        console.log('📡 Statut de l\'abonnement à la demande d\'inscription:', status);
      });

    // Timeout
    setTimeout(async () => {
      if (!resolved) {
        console.log(`⏰ Délai d\'attente dépassé pour la demande: requestId=${request.id}`);
        await supabase.from('signup_requests').delete().eq('id', request.id);
        supabase.removeChannel(channel);
        res.status(408).json({ error: 'Délai d\'attente dépassé pour la demande d\'inscription. Aucune réponse de l\'administrateur.' });
      }
    }, timeout);
  } catch (error) {
    console.error('Erreur serveur lors de l\'inscription:', error);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
};

module.exports = { TsignUp };